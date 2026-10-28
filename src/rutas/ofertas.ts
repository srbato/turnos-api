import { Router } from "express";

import {
  diasDesdeHoy,
  DIAS_MINIMOS_ADELANTO,
  enviarOfertasPendientes,
  esOfertaVigente,
  horarioReservado,
  idsDeOfertasVigentes,
  tieneOfertaVigente,
} from "../adelantos";
import { motivoSinAtencion } from "../atencion";
import { prisma } from "../prisma";
import { esFecha, esHora, parseId } from "../validaciones";

// Rutas de la lista de espera: ofertas de adelanto y horarios que Secretaría publica o retira.
// Se montan en /api (ver index.ts). Las reglas de a quién se le ofrece cada horario están en adelantos.ts.
export const rutasOfertas = Router();

// -----------------------------------------------------------------------------
// Datos y funciones auxiliares
// -----------------------------------------------------------------------------

const RESPUESTAS = ["aceptada", "rechazada", "sin-respuesta", "retirada"];

// Lo que se devuelve junto con cada oferta: el turno del paciente que se adelantaría, con su médico y su paciente.
const CON_TURNO = {
  turno: {
    include: {
      medico: { select: { id: true, nombre: true, especialidad: true, sala: true } },
      paciente: { select: { id: true, nombre: true, apellido: true } },
    },
  },
};

type MedicoConFranjas = {
  estado: string;
  licenciaHasta: string | null;
  franjas: { dia: number; desde: string; hasta: string }[];
};

// Revisa que un horario se pueda ofrecer: fecha y hora válidas, a 3 días o más, y que el médico atienda.
// Devuelve el error, o null si está bien.
function errorEnHorario(medico: MedicoConFranjas, fecha: unknown, hora: unknown) {
  if (!esFecha(fecha) || !esHora(hora)) {
    return "La fecha o la hora no son validas";
  }
  if (diasDesdeHoy(String(fecha)) < DIAS_MINIMOS_ADELANTO) {
    return `Solo se ofrecen horarios a ${DIAS_MINIMOS_ADELANTO} días o más de hoy`;
  }
  return motivoSinAtencion(medico, String(fecha), String(hora));
}

// ¿Hay un turno activo en ese horario?
async function horarioOcupado(medicoId: number, fecha: string, hora: string) {
  const turno = await prisma.turno.findFirst({
    where: { medicoId, fecha, hora, estado: { in: ["pendiente", "confirmado"] } },
  });
  return turno !== null;
}

// Publica un horario (si no estaba publicado) y lo saca de los retirados.
async function publicar(medicoId: number, fecha: string, hora: string) {
  await prisma.horarioRetirado.deleteMany({ where: { medicoId, fecha, hora } });
  const yaPublicado = await prisma.horarioPublicado.findFirst({ where: { medicoId, fecha, hora } });
  if (yaPublicado) {
    return yaPublicado;
  }
  return prisma.horarioPublicado.create({ data: { medicoId, fecha, hora } });
}

// Retira un horario de la oferta: deja de estar publicado y queda en los retirados (no se le ofrece a nadie más).
async function retirar(medicoId: number, fecha: string, hora: string) {
  await prisma.horarioPublicado.deleteMany({ where: { medicoId, fecha, hora } });
  const yaRetirado = await prisma.horarioRetirado.findFirst({ where: { medicoId, fecha, hora } });
  if (!yaRetirado) {
    await prisma.horarioRetirado.create({ data: { medicoId, fecha, hora } });
  }
}

// -----------------------------------------------------------------------------
// Rutas: lectura
// -----------------------------------------------------------------------------

// GET /api/ofertas?consultorioId=1
// Devuelve las ofertas de un consultorio, cada una con "vigente": true si todavía espera respuesta y el horario sigue
// libre. Opcionalmente se filtra por paciente: &pacienteId=1 (las que ve el paciente en su inicio).
// Antes de responder se mandan las ofertas que falten: con el paso de los días un horario libre puede entrar en los
// 3 días mínimos sin que nadie haya tocado nada.
rutasOfertas.get("/ofertas", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }
  const pacienteId = parseId(req.query.pacienteId) ?? undefined;

  await enviarOfertasPendientes(consultorioId);

  const ofertas = await prisma.ofertaAdelanto.findMany({
    where: { turno: { medico: { consultorioId }, pacienteId } },
    include: CON_TURNO,
    orderBy: { creadaEl: "desc" },
  });
  const vigentes = await idsDeOfertasVigentes(consultorioId);
  res.json(ofertas.map((oferta) => ({ ...oferta, vigente: vigentes.includes(oferta.id) })));
});

// GET /api/horarios-publicados?consultorioId=1
// Los horarios libres que Secretaría ofreció a la lista de espera.
rutasOfertas.get("/horarios-publicados", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }
  const publicados = await prisma.horarioPublicado.findMany({ where: { medico: { consultorioId } } });
  res.json(publicados);
});

// GET /api/horarios-retirados?consultorioId=1
// Los horarios que Secretaría sacó de la oferta (no se le ofrecen a nadie).
rutasOfertas.get("/horarios-retirados", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }
  const retirados = await prisma.horarioRetirado.findMany({ where: { medico: { consultorioId } } });
  res.json(retirados);
});

// -----------------------------------------------------------------------------
// Rutas: Secretaría ofrece horarios
// -----------------------------------------------------------------------------

// POST /api/horarios-publicados
// Secretaría ofrece a la lista de espera un horario libre de la agenda de un médico. Recibe { medicoId, fecha, hora }.
// El sistema se lo ofrece al primero de la lista que pueda usarlo.
rutasOfertas.post("/horarios-publicados", async (req, res) => {
  const { medicoId, fecha, hora } = req.body;
  const idMedico = parseId(medicoId);
  if (!idMedico) {
    return res.status(400).json({ error: "Falta el médico" });
  }

  const medico = await prisma.medico.findUnique({ where: { id: idMedico }, include: { franjas: true } });
  if (!medico) {
    return res.status(404).json({ error: "No existe un médico con ese id" });
  }
  const error = errorEnHorario(medico, fecha, hora);
  if (error) {
    return res.status(400).json({ error });
  }
  if (await horarioOcupado(idMedico, fecha, hora)) {
    return res.status(409).json({ error: "Ese horario ya está ocupado" });
  }

  const publicado = await publicar(idMedico, fecha, hora);
  await enviarOfertasPendientes(medico.consultorioId);
  res.status(201).json(publicado);
});

// POST /api/ofertas
// Secretaría le propone un horario a un paciente puntual de la lista. Recibe { turnoId, fecha, hora }: el turno del
// paciente y el horario (más temprano, con el mismo médico). El horario no se publica: si no lo acepta, queda libre y
// Secretaría decide a quién proponérselo después.
rutasOfertas.post("/ofertas", async (req, res) => {
  const { turnoId, fecha, hora } = req.body;
  const idTurno = parseId(turnoId);
  if (!idTurno) {
    return res.status(400).json({ error: "Falta el turno del paciente" });
  }

  const turno = await prisma.turno.findUnique({ where: { id: idTurno }, include: { medico: { include: { franjas: true } } } });
  if (!turno) {
    return res.status(404).json({ error: "No existe un turno con ese id" });
  }
  if (turno.estado !== "pendiente" && turno.estado !== "confirmado") {
    return res.status(400).json({ error: "Solo se adelanta un turno pendiente o confirmado" });
  }
  const error = errorEnHorario(turno.medico, fecha, hora);
  if (error) {
    return res.status(400).json({ error });
  }
  if (`${fecha} ${hora}` >= `${turno.fecha} ${turno.hora}`) {
    return res.status(400).json({ error: "El horario ofrecido tiene que ser antes que el turno del paciente" });
  }
  if (await horarioOcupado(turno.medicoId, fecha, hora)) {
    return res.status(409).json({ error: "Ese horario ya está ocupado" });
  }
  if (await horarioReservado(turno.medicoId, fecha, hora, null)) {
    return res.status(409).json({ error: "Ese horario ya está ofrecido a otro paciente" });
  }
  if (await tieneOfertaVigente(idTurno, turno.medico.consultorioId)) {
    return res.status(409).json({ error: "Ese paciente ya tiene una oferta esperando respuesta" });
  }

  await prisma.horarioRetirado.deleteMany({ where: { medicoId: turno.medicoId, fecha, hora } });
  const oferta = await prisma.ofertaAdelanto.create({ data: { turnoId: idTurno, fecha, hora }, include: CON_TURNO });
  res.status(201).json({ ...oferta, vigente: true });
});

// -----------------------------------------------------------------------------
// Rutas: respuestas
// -----------------------------------------------------------------------------

// PATCH /api/ofertas/:id
// Responde una oferta que espera respuesta. Recibe { estado }:
//   "aceptada"       el paciente acepta: su turno pasa al horario ofrecido y su horario anterior queda libre
//   "rechazada"      el paciente no la quiere
//   "sin-respuesta"  Secretaría marca que no contestó
//   "retirada"       Secretaría la cancela: el horario deja de ofrecerse
// Después de responder, el sistema ofrece los horarios que quedaron libres al siguiente de la lista.
rutasOfertas.patch("/ofertas/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const { estado } = req.body;
  if (!RESPUESTAS.includes(estado)) {
    return res.status(400).json({ error: "La respuesta no es valida" });
  }

  const oferta = await prisma.ofertaAdelanto.findUnique({ where: { id }, include: { turno: { include: { medico: true } } } });
  if (!oferta) {
    return res.status(404).json({ error: "No existe una oferta con ese id" });
  }
  if (oferta.estado !== "enviada") {
    return res.status(400).json({ error: "Esa oferta ya fue respondida" });
  }
  const turno = oferta.turno;

  if (estado === "aceptada") {
    // 409: la oferta existe, pero ya no se puede aceptar (por ejemplo, alguien tomó ese horario).
    if (!(await esOfertaVigente(id))) {
      return res.status(409).json({ error: "La oferta ya no está vigente" });
    }
    // El horario que deja el paciente queda libre para el siguiente de la lista.
    await publicar(turno.medicoId, turno.fecha, turno.hora);
    await prisma.turno.update({
      where: { id: turno.id },
      data: { fecha: oferta.fecha, hora: oferta.hora, estado: "confirmado", confirmo: true },
    });
  }
  if (estado === "retirada") {
    await retirar(turno.medicoId, oferta.fecha, oferta.hora);
  }

  const respondida = await prisma.ofertaAdelanto.update({ where: { id }, data: { estado }, include: CON_TURNO });
  await enviarOfertasPendientes(turno.medico.consultorioId);
  res.json({ ...respondida, vigente: false });
});

// POST /api/ofertas/:id/reprogramar
// Secretaría le cambia el horario ofrecido al mismo paciente. Recibe { fecha, hora }. La oferta vieja queda retirada
// (y su horario sale de la oferta) y se crea una oferta nueva con el horario nuevo, que queda publicado.
rutasOfertas.post("/ofertas/:id/reprogramar", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const oferta = await prisma.ofertaAdelanto.findUnique({
    where: { id },
    include: { turno: { include: { medico: { include: { franjas: true } } } } },
  });
  if (!oferta) {
    return res.status(404).json({ error: "No existe una oferta con ese id" });
  }
  if (oferta.estado !== "enviada") {
    return res.status(400).json({ error: "Esa oferta ya fue respondida" });
  }

  const { fecha, hora } = req.body;
  const turno = oferta.turno;
  const error = errorEnHorario(turno.medico, fecha, hora);
  if (error) {
    return res.status(400).json({ error });
  }
  if (`${fecha} ${hora}` >= `${turno.fecha} ${turno.hora}`) {
    return res.status(400).json({ error: "El horario ofrecido tiene que ser antes que el turno del paciente" });
  }
  if (await horarioOcupado(turno.medicoId, fecha, hora)) {
    return res.status(409).json({ error: "Ese horario ya está ocupado" });
  }
  if (await horarioReservado(turno.medicoId, fecha, hora, turno.id)) {
    return res.status(409).json({ error: "Ese horario ya está ofrecido a otro paciente" });
  }

  await prisma.ofertaAdelanto.update({ where: { id }, data: { estado: "retirada" } });
  await retirar(turno.medicoId, oferta.fecha, oferta.hora);
  await publicar(turno.medicoId, fecha, hora);
  const nueva = await prisma.ofertaAdelanto.create({ data: { turnoId: turno.id, fecha, hora }, include: CON_TURNO });
  await enviarOfertasPendientes(turno.medico.consultorioId);
  res.status(201).json({ ...nueva, vigente: true });
});
