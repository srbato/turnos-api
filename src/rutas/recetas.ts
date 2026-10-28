import { Router } from "express";

import { prisma } from "../prisma";
import { fechaDeHoy, parseId, texto } from "../validaciones";

// Rutas de las recetas que hacen los médicos. Se montan en /api (ver index.ts).
export const rutasRecetas = Router();

// Días de validez de una receta, si el médico no dice otra cosa.
const VIGENCIA_POR_DEFECTO_DIAS = 30;

// Lo que se devuelve junto con cada receta: quién la hizo y para quién.
const DATOS_DE_LA_RECETA = {
  medico: { select: { id: true, nombre: true } },
  paciente: { select: { id: true, nombre: true, apellido: true } },
};

// Arma el código que se muestra en la farmacia: "RX-2026-0498". Es el número más alto del año más uno, así los
// códigos siguen en orden. (Si se borra justo la última receta emitida, su número vuelve a quedar libre.)
async function codigoNuevo() {
  const prefijo = `RX-${fechaDeHoy().slice(0, 4)}-`;
  // Como los números tienen siempre 4 cifras, el código más alto en orden alfabético es también el número más alto.
  const ultima = await prisma.receta.findFirst({
    where: { codigo: { startsWith: prefijo } },
    orderBy: { codigo: "desc" },
  });
  let numero = 1;
  if (ultima) {
    numero = Number(ultima.codigo.slice(prefijo.length)) + 1;
  }
  return prefijo + String(numero).padStart(4, "0");
}

// GET /api/recetas?consultorioId=1
// Devuelve las recetas de un consultorio, de la más nueva a la más vieja. Opcionalmente se filtra por paciente
// o por médico: &pacienteId=1 (las que ve el paciente) o &medicoId=3 (las que hizo un médico).
rutasRecetas.get("/recetas", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }
  // Los filtros que no llegan quedan en undefined, y Prisma los ignora.
  const pacienteId = parseId(req.query.pacienteId) ?? undefined;
  const medicoId = parseId(req.query.medicoId) ?? undefined;

  const recetas = await prisma.receta.findMany({
    where: { paciente: { consultorioId }, pacienteId, medicoId },
    include: DATOS_DE_LA_RECETA,
    orderBy: { fechaEmision: "desc" },
  });
  res.json(recetas);
});

// POST /api/recetas
// El médico emite una receta. Recibe { pacienteId, medicoId, medicamento, indicacion, riesgo?, vigenciaDias? }.
// La fecha de emisión y el código los pone el servidor.
rutasRecetas.post("/recetas", async (req, res) => {
  const { pacienteId, medicoId, medicamento, indicacion, riesgo, vigenciaDias } = req.body;

  const idPaciente = parseId(pacienteId);
  const idMedico = parseId(medicoId);
  if (!idPaciente || !idMedico || !texto(medicamento) || !texto(indicacion)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  const vigencia = vigenciaDias === undefined ? VIGENCIA_POR_DEFECTO_DIAS : Number(vigenciaDias);
  if (!Number.isInteger(vigencia) || vigencia < 1) {
    return res.status(400).json({ error: "La vigencia tiene que ser un número de días" });
  }

  const paciente = await prisma.paciente.findUnique({ where: { id: idPaciente } });
  const medico = await prisma.medico.findUnique({ where: { id: idMedico } });
  if (!paciente || !medico) {
    return res.status(404).json({ error: "No existe el paciente o el médico" });
  }
  if (paciente.consultorioId !== medico.consultorioId) {
    return res.status(400).json({ error: "El paciente y el médico son de consultorios distintos" });
  }

  const receta = await prisma.receta.create({
    data: {
      pacienteId: idPaciente,
      medicoId: idMedico,
      medicamento: texto(medicamento),
      indicacion: texto(indicacion),
      riesgo: Boolean(riesgo),
      vigenciaDias: vigencia,
      fechaEmision: fechaDeHoy(),
      codigo: await codigoNuevo(),
    },
    include: DATOS_DE_LA_RECETA,
  });
  res.status(201).json(receta);
});

// PATCH /api/recetas/:id
// El médico corrige una receta: medicamento, indicacion o riesgo (todos opcionales).
// El paciente, la fecha y el código no cambian.
rutasRecetas.patch("/recetas/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const receta = await prisma.receta.findUnique({ where: { id } });
  if (!receta) {
    return res.status(404).json({ error: "No existe una receta con ese id" });
  }

  const { medicamento, indicacion, riesgo } = req.body;
  const data: { medicamento?: string; indicacion?: string; riesgo?: boolean } = {};
  if (medicamento !== undefined) {
    if (!texto(medicamento)) {
      return res.status(400).json({ error: "El medicamento no puede quedar vacío" });
    }
    data.medicamento = texto(medicamento);
  }
  if (indicacion !== undefined) {
    if (!texto(indicacion)) {
      return res.status(400).json({ error: "La indicación no puede quedar vacía" });
    }
    data.indicacion = texto(indicacion);
  }
  if (riesgo !== undefined) data.riesgo = Boolean(riesgo);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const actualizada = await prisma.receta.update({ where: { id }, data, include: DATOS_DE_LA_RECETA });
  res.json(actualizada);
});

// DELETE /api/recetas/:id
// El médico elimina una receta que no correspondía. 204: salió bien y no hay nada para devolver.
rutasRecetas.delete("/recetas/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const receta = await prisma.receta.findUnique({ where: { id } });
  if (!receta) {
    return res.status(404).json({ error: "No existe una receta con ese id" });
  }

  await prisma.receta.delete({ where: { id } });
  res.status(204).end();
});
