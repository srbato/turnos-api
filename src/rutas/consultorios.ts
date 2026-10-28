import { Router } from "express";

import { DURACIONES_DE_TURNO } from "../atencion";
import { prisma } from "../prisma";
import { parseId, texto } from "../validaciones";

// Rutas del consultorio (datos y ajustes) y del catálogo de obras sociales. Se montan en /api (ver index.ts).
export const rutasConsultorios = Router();

// GET /api/coberturas
// Devuelve el catálogo de obras sociales, para elegirlas al registrarse o en el perfil.
rutasConsultorios.get("/coberturas", async (_req, res) => {
  const coberturas = await prisma.cobertura.findMany({ orderBy: { nombre: "asc" } });
  res.json(coberturas);
});

// GET /api/consultorios/:id
// Devuelve los datos y la configuración de un consultorio (lo que se ve en Ajustes).
rutasConsultorios.get("/consultorios/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const consultorio = await prisma.consultorio.findUnique({ where: { id } });
  if (!consultorio) {
    return res.status(404).json({ error: "No existe un consultorio con ese id" });
  }

  res.json(consultorio);
});

// PATCH /api/consultorios/:id
// Secretaría cambia los datos o la configuración del consultorio. Todos los campos son opcionales:
// nombre, direccion, ciudad, telefono, atencion, duracionTurno, puntosRiesgoMedio, puntosRiesgoAlto, avisosAntesDeActuar.
rutasConsultorios.patch("/consultorios/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const consultorio = await prisma.consultorio.findUnique({ where: { id } });
  if (!consultorio) {
    return res.status(404).json({ error: "No existe un consultorio con ese id" });
  }

  const { nombre, direccion, ciudad, telefono, atencion, duracionTurno, puntosRiesgoMedio, puntosRiesgoAlto, avisosAntesDeActuar } =
    req.body;
  const data: {
    nombre?: string;
    direccion?: string;
    ciudad?: string;
    telefono?: string;
    atencion?: string;
    duracionTurno?: number;
    puntosRiesgoMedio?: number;
    puntosRiesgoAlto?: number;
    avisosAntesDeActuar?: number;
  } = {};

  if (nombre !== undefined) {
    if (!texto(nombre)) {
      return res.status(400).json({ error: "El nombre no puede quedar vacío" });
    }
    data.nombre = texto(nombre);
  }
  if (direccion !== undefined) {
    if (!texto(direccion)) {
      return res.status(400).json({ error: "La dirección no puede quedar vacía" });
    }
    data.direccion = texto(direccion);
  }
  if (ciudad !== undefined) data.ciudad = texto(ciudad);
  if (telefono !== undefined) data.telefono = texto(telefono);
  if (atencion !== undefined) data.atencion = texto(atencion);

  if (duracionTurno !== undefined) {
    if (!DURACIONES_DE_TURNO.includes(Number(duracionTurno))) {
      return res.status(400).json({ error: "La duración tiene que ser de 15, 20, 30 o 45 minutos" });
    }
    data.duracionTurno = Number(duracionTurno);
  }

  // Reglas de riesgo: números enteros, y el riesgo alto empieza en más puntos que el medio.
  if (puntosRiesgoMedio !== undefined) data.puntosRiesgoMedio = Number(puntosRiesgoMedio);
  if (puntosRiesgoAlto !== undefined) data.puntosRiesgoAlto = Number(puntosRiesgoAlto);
  if (avisosAntesDeActuar !== undefined) data.avisosAntesDeActuar = Number(avisosAntesDeActuar);
  const medio = data.puntosRiesgoMedio ?? consultorio.puntosRiesgoMedio;
  const alto = data.puntosRiesgoAlto ?? consultorio.puntosRiesgoAlto;
  const avisos = data.avisosAntesDeActuar ?? consultorio.avisosAntesDeActuar;
  if (!Number.isInteger(medio) || !Number.isInteger(alto) || medio < 0) {
    return res.status(400).json({ error: "Los puntos de riesgo tienen que ser números enteros" });
  }
  if (alto <= medio) {
    return res.status(400).json({ error: "El riesgo alto tiene que empezar en más puntos que el riesgo medio" });
  }
  if (!Number.isInteger(avisos) || avisos < 1) {
    return res.status(400).json({ error: "Hay que mandar al menos un aviso" });
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const actualizado = await prisma.consultorio.update({ where: { id }, data });
  res.json(actualizado);
});
