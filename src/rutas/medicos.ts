import { Router } from "express";

import { cancelarTurnosSinAtencion, errorEnFranjas, Franja } from "../atencion";
import { cifrarContrasena } from "../contrasenas";
import { prisma } from "../prisma";
import { esEmail, esFecha, parseId, texto } from "../validaciones";

// Rutas de los médicos. Se montan en /api (ver index.ts).
export const rutasMedicos = Router();

// -----------------------------------------------------------------------------
// Datos y funciones auxiliares
// -----------------------------------------------------------------------------

const ESTADOS = ["activo", "licencia", "baja"];

// Lo que se devuelve de cada médico: sus datos (sin la contraseña), sus horarios y las obras sociales que acepta.
const SIN_CONTRASENA = { contrasena: true }; // omit: Prisma no trae ese campo
const CON_HORARIOS = { franjas: true, coberturas: true };

// Iniciales de las dos últimas palabras del nombre: "Dra. Laura Gómez" -> "LG" (así no cuenta el "Dr." / "Dra.").
function iniciales(nombre: string) {
  const palabras = nombre.split(" ").filter((palabra) => palabra !== "");
  return palabras
    .slice(-2)
    .map((palabra) => palabra[0].toUpperCase())
    .join("");
}

// Reemplaza los horarios de un médico: borra los anteriores y carga los nuevos.
async function guardarFranjas(medicoId: number, franjas: Franja[]) {
  await prisma.franjaHoraria.deleteMany({ where: { medicoId } });
  for (const franja of franjas) {
    await prisma.franjaHoraria.create({
      data: { medicoId: medicoId, dia: franja.dia, desde: franja.desde, hasta: franja.hasta },
    });
  }
}

// -----------------------------------------------------------------------------
// Rutas
// -----------------------------------------------------------------------------

// GET /api/medicos?consultorioId=1
// Devuelve los médicos de un consultorio (también los de baja: la app decide si mostrarlos).
rutasMedicos.get("/medicos", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }

  const medicos = await prisma.medico.findMany({
    where: { consultorioId },
    omit: SIN_CONTRASENA,
    include: CON_HORARIOS,
    orderBy: { nombre: "asc" },
  });
  res.json(medicos);
});

// GET /api/medicos/:id
rutasMedicos.get("/medicos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const medico = await prisma.medico.findUnique({ where: { id }, omit: SIN_CONTRASENA, include: CON_HORARIOS });
  if (!medico) {
    return res.status(404).json({ error: "No existe un médico con ese id" });
  }
  res.json(medico);
});

// POST /api/medicos
// Secretaría da de alta un médico. Recibe { consultorioId, nombre, especialidad, matricula, email, contrasena,
// franjas: [{ dia, desde, hasta }], sala?, coberturaIds? }.
// Si no se dice la sala, se le asigna la siguiente; si no se dicen las obras sociales, acepta todas.
rutasMedicos.post("/medicos", async (req, res) => {
  const { consultorioId, nombre, especialidad, matricula, email, contrasena, franjas, sala, coberturaIds } = req.body;

  const idConsultorio = parseId(consultorioId);
  if (!idConsultorio || !texto(nombre) || !texto(especialidad) || !texto(matricula)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  if (!esEmail(email)) {
    return res.status(400).json({ error: "El email no es valido" });
  }
  if (String(contrasena ?? "").length < 6) {
    return res.status(400).json({ error: "La contraseña tiene que tener al menos 6 caracteres" });
  }
  const errorFranjas = errorEnFranjas(franjas);
  if (errorFranjas) {
    return res.status(400).json({ error: errorFranjas });
  }

  const consultorio = await prisma.consultorio.findUnique({ where: { id: idConsultorio } });
  if (!consultorio) {
    return res.status(404).json({ error: "No existe ese consultorio" });
  }

  // En un consultorio no puede haber dos médicos con la misma matrícula o el mismo email.
  const correo = texto(email).toLowerCase();
  const repetido = await prisma.medico.findFirst({
    where: { consultorioId: idConsultorio, OR: [{ matricula: texto(matricula) }, { email: correo }] },
  });
  if (repetido) {
    return res.status(409).json({ error: "Ya hay un médico con esa matrícula o ese email" });
  }

  // Obras sociales que acepta: las que se pasaron, o todas las del catálogo.
  let idsCoberturas: string[] = [];
  if (Array.isArray(coberturaIds)) {
    idsCoberturas = coberturaIds.map((id) => String(id));
  } else {
    const todas = await prisma.cobertura.findMany();
    idsCoberturas = todas.map((cobertura) => cobertura.id);
  }

  const cantidad = await prisma.medico.count({ where: { consultorioId: idConsultorio } });
  const medico = await prisma.medico.create({
    data: {
      consultorioId: idConsultorio,
      nombre: texto(nombre),
      iniciales: iniciales(texto(nombre)),
      especialidad: texto(especialidad),
      matricula: texto(matricula),
      sala: texto(sala) || `Consultorio ${cantidad + 1}`,
      email: correo,
      contrasena: cifrarContrasena(String(contrasena)),
      // Se "conectan" las obras sociales que ya existen en la tabla Cobertura.
      coberturas: { connect: idsCoberturas.map((id) => ({ id: id })) },
    },
  });
  await guardarFranjas(medico.id, franjas);

  const creado = await prisma.medico.findUnique({ where: { id: medico.id }, omit: SIN_CONTRASENA, include: CON_HORARIOS });
  res.status(201).json(creado);
});

// PATCH /api/medicos/:id
// Secretaría cambia datos del médico, o el médico su perfil. Todos los campos son opcionales:
//   especialidad, matricula, sala, telefono, domicilio, fotoUri (null para sacar la foto)
//   estado          "activo" | "licencia" | "baja"
//   licenciaHasta   'AAAA-MM-DD': el día en que vuelve (obligatorio al pasar a licencia)
// El nombre no se cambia: figura en los turnos y las recetas.
// Si el médico pasa a licencia o a baja, sus turnos futuros afectados se cancelan solos (con el motivo).
rutasMedicos.patch("/medicos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const medico = await prisma.medico.findUnique({ where: { id } });
  if (!medico) {
    return res.status(404).json({ error: "No existe un médico con ese id" });
  }

  const { especialidad, matricula, sala, telefono, domicilio, fotoUri, estado, licenciaHasta } = req.body;
  const data: {
    especialidad?: string;
    matricula?: string;
    sala?: string;
    telefono?: string;
    domicilio?: string;
    fotoUri?: string | null;
    estado?: string;
    licenciaHasta?: string | null;
  } = {};

  if (especialidad !== undefined) {
    if (!texto(especialidad)) {
      return res.status(400).json({ error: "La especialidad no puede quedar vacía" });
    }
    data.especialidad = texto(especialidad);
  }
  if (sala !== undefined) {
    if (!texto(sala)) {
      return res.status(400).json({ error: "La sala no puede quedar vacía" });
    }
    data.sala = texto(sala);
  }
  if (matricula !== undefined) {
    if (!texto(matricula)) {
      return res.status(400).json({ error: "La matrícula no puede quedar vacía" });
    }
    const repetido = await prisma.medico.findFirst({
      where: { consultorioId: medico.consultorioId, matricula: texto(matricula), id: { not: id } },
    });
    if (repetido) {
      return res.status(409).json({ error: "Ya hay otro médico con esa matrícula" });
    }
    data.matricula = texto(matricula);
  }
  if (telefono !== undefined) data.telefono = texto(telefono);
  if (domicilio !== undefined) data.domicilio = texto(domicilio);
  if (fotoUri !== undefined) data.fotoUri = fotoUri === null ? null : String(fotoUri);

  if (estado !== undefined) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: "El estado no es valido" });
    }
    data.estado = estado;
    if (estado === "licencia") {
      // La licencia siempre es por un plazo: hace falta saber el día en que vuelve.
      if (!esFecha(licenciaHasta)) {
        return res.status(400).json({ error: "Para una licencia hace falta la fecha de vuelta" });
      }
      data.licenciaHasta = licenciaHasta;
    } else {
      // Al volver a activo (o al darlo de baja) ya no hay fecha de vuelta.
      data.licenciaHasta = null;
    }
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  await prisma.medico.update({ where: { id }, data });
  if (data.estado !== undefined) {
    await cancelarTurnosSinAtencion(id);
  }

  const actualizado = await prisma.medico.findUnique({ where: { id }, omit: SIN_CONTRASENA, include: CON_HORARIOS });
  res.json(actualizado);
});

// PUT /api/medicos/:id/franjas
// Secretaría carga los horarios de atención del médico. Recibe { franjas: [{ dia, desde, hasta }] } y reemplaza
// todos los anteriores (por eso es PUT). Los turnos futuros que quedan fuera de horario se cancelan solos.
rutasMedicos.put("/medicos/:id/franjas", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const { franjas } = req.body;
  const errorFranjas = errorEnFranjas(franjas);
  if (errorFranjas) {
    return res.status(400).json({ error: errorFranjas });
  }

  const medico = await prisma.medico.findUnique({ where: { id } });
  if (!medico) {
    return res.status(404).json({ error: "No existe un médico con ese id" });
  }

  await guardarFranjas(id, franjas);
  await cancelarTurnosSinAtencion(id);

  const actualizado = await prisma.medico.findUnique({ where: { id }, omit: SIN_CONTRASENA, include: CON_HORARIOS });
  res.json(actualizado);
});
