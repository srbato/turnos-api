import { Router } from "express";

import { enviarOfertasPendientes, horarioReservado } from "../adelantos";
import { motivoSinAtencion } from "../atencion";
import { prisma } from "../prisma";
import { esFecha, esHora, fechaDeHoy, parseId } from "../validaciones";

// Rutas de los turnos. Se montan en /api (ver index.ts).
export const rutasTurnos = Router();

// -----------------------------------------------------------------------------
// Datos y funciones auxiliares
// -----------------------------------------------------------------------------

const ESTADOS = ["pendiente", "confirmado", "cancelado", "atendido", "ausente"];

// Lo que se devuelve junto con cada turno. Del médico y del paciente solo los datos que muestra la app
// (nunca su contraseña).
const DATOS_DEL_TURNO = {
  medico: { select: { id: true, nombre: true, especialidad: true, sala: true } },
  paciente: { select: { id: true, nombre: true, apellido: true } },
  cobertura: true,
  avisos: true,
  consulta: true,
  preconsulta: true,
};

// ¿Ese horario del médico ya está tomado por otro turno? Los cancelados liberan el horario.
// idIgnorado sirve al reprogramar: el propio turno no cuenta como ocupado.
async function horarioOcupado(medicoId: number, fecha: string, hora: string, idIgnorado: number | null) {
  const otro = await prisma.turno.findFirst({
    where: {
      medicoId: medicoId,
      fecha: fecha,
      hora: hora,
      estado: { not: "cancelado" },
      // Si hay un turno para ignorar, se excluye; si no, el filtro queda en undefined y Prisma lo ignora.
      id: idIgnorado ? { not: idIgnorado } : undefined,
    },
  });
  return otro !== null;
}

// -----------------------------------------------------------------------------
// Rutas
// -----------------------------------------------------------------------------

// GET /api/turnos?consultorioId=1
// Devuelve los turnos de un consultorio. Opcionalmente se filtra por paciente o por médico:
// /api/turnos?consultorioId=1&pacienteId=3 o /api/turnos?consultorioId=1&medicoId=2
rutasTurnos.get("/turnos", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }
  // Los filtros que no llegan quedan en undefined, y Prisma los ignora.
  const pacienteId = parseId(req.query.pacienteId) ?? undefined;
  const medicoId = parseId(req.query.medicoId) ?? undefined;

  const turnos = await prisma.turno.findMany({
    where: {
      medico: { consultorioId: consultorioId },
      pacienteId: pacienteId,
      medicoId: medicoId,
    },
    include: DATOS_DEL_TURNO,
    orderBy: [{ fecha: "asc" }, { hora: "asc" }],
  });

  res.json(turnos);
});

// GET /api/turnos/:id
// Devuelve un turno.
rutasTurnos.get("/turnos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const turno = await prisma.turno.findUnique({ where: { id }, include: DATOS_DEL_TURNO });
  if (!turno) {
    return res.status(404).json({ error: "No existe un turno con ese id" });
  }

  res.json(turno);
});

// POST /api/turnos
// Saca un turno nuevo. Recibe { pacienteId, medicoId, fecha, hora, coberturaId?, adelanto? }.
// adelanto: true anota el turno en la lista de espera para adelantarlo.
rutasTurnos.post("/turnos", async (req, res) => {
  const { pacienteId, medicoId, fecha, hora, coberturaId, adelanto } = req.body;

  const idPaciente = parseId(pacienteId);
  const idMedico = parseId(medicoId);
  if (!idPaciente || !idMedico || !fecha || !hora) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  if (!esFecha(fecha) || !esHora(hora)) {
    return res.status(400).json({ error: "La fecha o la hora no son validas" });
  }
  if (fecha < fechaDeHoy()) {
    return res.status(400).json({ error: "No se puede sacar un turno en una fecha que ya pasó" });
  }

  const paciente = await prisma.paciente.findUnique({ where: { id: idPaciente } });
  const medico = await prisma.medico.findUnique({ where: { id: idMedico }, include: { franjas: true } });
  if (!paciente || !medico) {
    return res.status(404).json({ error: "No existe el paciente o el médico" });
  }
  if (paciente.consultorioId !== medico.consultorioId) {
    return res.status(400).json({ error: "El paciente y el médico son de consultorios distintos" });
  }
  // Si el médico no atiende ese día u horario, el error dice por qué (de licencia, no atiende ese día, etc.).
  const motivo = motivoSinAtencion(medico, fecha, hora);
  if (motivo) {
    return res.status(400).json({ error: motivo });
  }
  // 409 Conflict: el pedido es correcto, pero choca con otro turno que ya existe.
  if (await horarioOcupado(idMedico, fecha, hora, null)) {
    return res.status(409).json({ error: "Ese horario ya está ocupado" });
  }
  // Un horario ofrecido a la lista de espera queda reservado hasta que el paciente responda.
  if (await horarioReservado(idMedico, fecha, hora, null)) {
    return res.status(409).json({ error: "Ese horario está ofrecido a otro paciente de la lista de espera" });
  }

  // La obra social es opcional (null = particular), pero si llega tiene que ser una del paciente.
  let idCobertura: string | null = null;
  if (coberturaId) {
    const tieneCobertura = await prisma.pacienteCobertura.findFirst({
      where: { pacienteId: idPaciente, coberturaId: String(coberturaId) },
    });
    if (!tieneCobertura) {
      return res.status(400).json({ error: "El paciente no tiene esa obra social" });
    }
    idCobertura = String(coberturaId);
  }

  const turno = await prisma.turno.create({
    data: {
      pacienteId: idPaciente,
      medicoId: idMedico,
      coberturaId: idCobertura,
      fecha: fecha,
      hora: hora,
      reservadoEl: fechaDeHoy(),
      adelantoDesde: adelanto ? fechaDeHoy() : null,
    },
    include: DATOS_DEL_TURNO,
  });

  // Si el paciente se anotó en la lista de espera, puede haber un horario libre para ofrecerle ya.
  if (adelanto) {
    await enviarOfertasPendientes(medico.consultorioId);
  }

  // 201 indica que se creó un recurso nuevo.
  res.status(201).json(turno);
});

// PATCH /api/turnos/:id
// Cambia una parte del turno. Acepta (todos opcionales):
//   estado            "pendiente" | "confirmado" | "cancelado" | "atendido" | "ausente"
//   motivoCancelacion por qué se canceló (lo usa el sistema o Secretaría al cancelar por riesgo)
//   fecha y hora      reprogramar: van juntas, y el turno vuelve a "pendiente" salvo que llegue otro estado
//   adelanto          true / false: anota o saca el turno de la lista de espera
rutasTurnos.patch("/turnos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const turno = await prisma.turno.findUnique({ where: { id }, include: { medico: { include: { franjas: true } } } });
  if (!turno) {
    return res.status(404).json({ error: "No existe un turno con ese id" });
  }

  const { estado, motivoCancelacion, fecha, hora, adelanto } = req.body;
  const data: {
    estado?: string;
    confirmo?: boolean;
    motivoCancelacion?: string;
    fecha?: string;
    hora?: string;
    adelantoDesde?: string | null;
  } = {};

  // Reprogramar: se valida igual que al sacar un turno.
  if (fecha !== undefined || hora !== undefined) {
    if (!esFecha(fecha) || !esHora(hora)) {
      return res.status(400).json({ error: "Para reprogramar hacen falta una fecha y una hora validas" });
    }
    if (fecha < fechaDeHoy()) {
      return res.status(400).json({ error: "No se puede reprogramar a una fecha que ya pasó" });
    }
    const motivo = motivoSinAtencion(turno.medico, fecha, hora);
    if (motivo) {
      return res.status(400).json({ error: motivo });
    }
    if (await horarioOcupado(turno.medicoId, fecha, hora, id)) {
      return res.status(409).json({ error: "Ese horario ya está ocupado" });
    }
    if (await horarioReservado(turno.medicoId, fecha, hora, id)) {
      return res.status(409).json({ error: "Ese horario está ofrecido a otro paciente de la lista de espera" });
    }
    data.fecha = fecha;
    data.hora = hora;
    data.estado = "pendiente"; // queda pendiente hasta que se vuelva a confirmar
  }

  if (estado !== undefined) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: "El estado no es valido" });
    }
    data.estado = estado;
    // Se deja anotado que el paciente confirmó alguna vez: suma a su historial aunque después lo atiendan.
    if (estado === "confirmado") {
      data.confirmo = true;
    }
  }

  if (motivoCancelacion !== undefined) {
    data.motivoCancelacion = String(motivoCancelacion).trim();
  }

  if (adelanto !== undefined) {
    data.adelantoDesde = adelanto ? fechaDeHoy() : null;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const actualizado = await prisma.turno.update({ where: { id }, data, include: DATOS_DEL_TURNO });
  // Si se canceló o se movió, su horario quedó libre; si entró o salió de la lista, cambia a quién ofrecerle.
  await enviarOfertasPendientes(turno.medico.consultorioId);
  res.json(actualizado);
});

// PUT /api/turnos/:id/consulta
// El médico registra (o corrige) la consulta de un turno: el turno queda como atendido.
// Recibe { motivo, diagnostico, indicaciones, notas }. Es PUT porque reemplaza la consulta entera.
rutasTurnos.put("/turnos/:id/consulta", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const { motivo, diagnostico, indicaciones, notas } = req.body;
  if (!String(diagnostico ?? "").trim()) {
    return res.status(400).json({ error: "Falta el diagnóstico" });
  }

  const turno = await prisma.turno.findUnique({ where: { id } });
  if (!turno) {
    return res.status(404).json({ error: "No existe un turno con ese id" });
  }

  const datosConsulta = {
    motivo: String(motivo ?? "").trim(),
    diagnostico: String(diagnostico).trim(),
    indicaciones: String(indicaciones ?? "").trim(),
    notas: String(notas ?? "").trim(),
  };
  // upsert: si el turno ya tenía consulta la actualiza, y si no la crea.
  await prisma.consulta.upsert({
    where: { turnoId: id },
    update: datosConsulta,
    create: { ...datosConsulta, turnoId: id },
  });

  const actualizado = await prisma.turno.update({
    where: { id },
    data: { estado: "atendido" },
    include: DATOS_DEL_TURNO,
  });
  res.json(actualizado);
});

// POST /api/turnos/:id/avisos
// Secretaría le avisa al paciente que confirme un turno pendiente. Se pueden mandar como máximo los avisos que
// configuró el consultorio (avisosAntesDeActuar): con eso alcanza para poder cancelar por riesgo.
rutasTurnos.post("/turnos/:id/avisos", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const turno = await prisma.turno.findUnique({
    where: { id },
    include: { avisos: true, medico: { include: { consultorio: true } } },
  });
  if (!turno) {
    return res.status(404).json({ error: "No existe un turno con ese id" });
  }
  if (turno.estado !== "pendiente") {
    return res.status(400).json({ error: "Solo se avisa en turnos pendientes de confirmar" });
  }
  if (turno.avisos.length >= turno.medico.consultorio.avisosAntesDeActuar) {
    return res.status(400).json({ error: "Ya se mandaron todos los avisos para este turno" });
  }

  const aviso = await prisma.aviso.create({ data: { turnoId: id, fecha: fechaDeHoy() } });
  res.status(201).json(aviso);
});

// GET /api/turnos/:id/preconsulta
// Devuelve la preconsulta del turno (404 si el paciente todavía no la hizo).
rutasTurnos.get("/turnos/:id/preconsulta", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const preconsulta = await prisma.preconsulta.findUnique({ where: { turnoId: id } });
  if (!preconsulta) {
    return res.status(404).json({ error: "Este turno no tiene preconsulta" });
  }
  res.json(preconsulta);
});

// PUT /api/turnos/:id/preconsulta
// El paciente envía su preconsulta (o la vuelve a enviar corregida: reemplaza la anterior, por eso es PUT).
// Recibe { motivo, duracion, sintomas: ["Fiebre", "Tos"], medicacion, alergias, adicional }; todos pueden ir vacíos
// porque el asistente deja saltear preguntas. Solo se puede en turnos pendientes o confirmados.
rutasTurnos.put("/turnos/:id/preconsulta", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const turno = await prisma.turno.findUnique({ where: { id } });
  if (!turno) {
    return res.status(404).json({ error: "No existe un turno con ese id" });
  }
  if (turno.estado !== "pendiente" && turno.estado !== "confirmado") {
    return res.status(400).json({ error: "Solo se hace la preconsulta de un turno pendiente o confirmado" });
  }

  const { motivo, duracion, sintomas, medicacion, alergias, adicional } = req.body;
  // Los síntomas llegan como lista y se guardan como texto separado por comas.
  let textoSintomas = "";
  if (Array.isArray(sintomas)) {
    textoSintomas = sintomas.map((sintoma) => String(sintoma).trim()).join(", ");
  }

  const datos = {
    motivo: String(motivo ?? "").trim(),
    duracion: String(duracion ?? "").trim(),
    sintomas: textoSintomas,
    medicacion: String(medicacion ?? "").trim(),
    alergias: String(alergias ?? "").trim(),
    adicional: String(adicional ?? "").trim(),
  };
  // upsert: si ya había una preconsulta la reemplaza (y actualiza la fecha de envío), y si no la crea.
  const preconsulta = await prisma.preconsulta.upsert({
    where: { turnoId: id },
    update: { ...datos, enviadaEl: new Date() },
    create: { ...datos, turnoId: id },
  });
  res.json(preconsulta);
});
