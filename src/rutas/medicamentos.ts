import { Router } from "express";

import { prisma } from "../prisma";
import { parseId, texto } from "../validaciones";

// Rutas de los medicamentos que el paciente toma por su cuenta (los recetados están en /api/recetas).
// Se montan en /api (ver index.ts).
export const rutasMedicamentos = Router();

// GET /api/medicamentos?pacienteId=1
// Devuelve los medicamentos propios de un paciente.
rutasMedicamentos.get("/medicamentos", async (req, res) => {
  const pacienteId = parseId(req.query.pacienteId);
  if (!pacienteId) {
    return res.status(400).json({ error: "Falta el paciente" });
  }

  const medicamentos = await prisma.medicamentoPropio.findMany({ where: { pacienteId }, orderBy: { nombre: "asc" } });
  res.json(medicamentos);
});

// POST /api/medicamentos
// El paciente agrega un medicamento. Recibe { pacienteId, nombre, dosis?, motivo? }.
rutasMedicamentos.post("/medicamentos", async (req, res) => {
  const { pacienteId, nombre, dosis, motivo } = req.body;

  const idPaciente = parseId(pacienteId);
  if (!idPaciente || !texto(nombre)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  const paciente = await prisma.paciente.findUnique({ where: { id: idPaciente } });
  if (!paciente) {
    return res.status(404).json({ error: "No existe un paciente con ese id" });
  }

  const medicamento = await prisma.medicamentoPropio.create({
    data: { pacienteId: idPaciente, nombre: texto(nombre), dosis: texto(dosis), motivo: texto(motivo) },
  });
  res.status(201).json(medicamento);
});

// PATCH /api/medicamentos/:id
// El paciente corrige un medicamento: nombre, dosis o motivo (todos opcionales).
rutasMedicamentos.patch("/medicamentos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const medicamento = await prisma.medicamentoPropio.findUnique({ where: { id } });
  if (!medicamento) {
    return res.status(404).json({ error: "No existe un medicamento con ese id" });
  }

  const { nombre, dosis, motivo } = req.body;
  const data: { nombre?: string; dosis?: string; motivo?: string } = {};
  if (nombre !== undefined) {
    if (!texto(nombre)) {
      return res.status(400).json({ error: "El nombre no puede quedar vacío" });
    }
    data.nombre = texto(nombre);
  }
  if (dosis !== undefined) data.dosis = texto(dosis);
  if (motivo !== undefined) data.motivo = texto(motivo);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const actualizado = await prisma.medicamentoPropio.update({ where: { id }, data });
  res.json(actualizado);
});

// DELETE /api/medicamentos/:id
// El paciente borra un medicamento que ya no toma. 204: salió bien y no hay nada para devolver.
rutasMedicamentos.delete("/medicamentos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const medicamento = await prisma.medicamentoPropio.findUnique({ where: { id } });
  if (!medicamento) {
    return res.status(404).json({ error: "No existe un medicamento con ese id" });
  }

  await prisma.medicamentoPropio.delete({ where: { id } });
  res.status(204).end();
});
