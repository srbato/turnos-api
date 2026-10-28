import { Router } from "express";

import { prisma } from "../prisma";
import { parseId } from "../validaciones";

// Rutas de los estudios que los médicos le piden al paciente. Por ahora la app solo los muestra, así que son de
// lectura. Se montan en /api (ver index.ts).
export const rutasEstudios = Router();

// Lo que se devuelve junto con cada estudio: quién lo pidió.
const CON_MEDICO = { medico: { select: { id: true, nombre: true } } };

// GET /api/estudios?pacienteId=1
// Devuelve los estudios de un paciente (la app los separa en pendientes e historial según el estado).
rutasEstudios.get("/estudios", async (req, res) => {
  const pacienteId = parseId(req.query.pacienteId);
  if (!pacienteId) {
    return res.status(400).json({ error: "Falta el paciente" });
  }

  const estudios = await prisma.estudio.findMany({ where: { pacienteId }, include: CON_MEDICO });
  res.json(estudios);
});

// GET /api/estudios/:id
rutasEstudios.get("/estudios/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const estudio = await prisma.estudio.findUnique({ where: { id }, include: CON_MEDICO });
  if (!estudio) {
    return res.status(404).json({ error: "No existe un estudio con ese id" });
  }
  res.json(estudio);
});
