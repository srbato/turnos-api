import { Router } from "express";

import { cifrarContrasena, contrasenaCorrecta } from "../contrasenas";
import { prisma } from "../prisma";
import { esEmail, parseId, texto } from "../validaciones";

// Rutas de las secretarias. Se montan en /api (ver index.ts).
export const rutasSecretarias = Router();

const ESTADOS = ["activo", "licencia"];
const SIN_CONTRASENA = { contrasena: true }; // omit: Prisma no trae ese campo

// GET /api/secretarias?consultorioId=1
// Devuelve las secretarias de un consultorio.
rutasSecretarias.get("/secretarias", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }

  const secretarias = await prisma.secretaria.findMany({
    where: { consultorioId },
    omit: SIN_CONTRASENA,
    orderBy: { nombre: "asc" },
  });
  res.json(secretarias);
});

// GET /api/secretarias/:id
rutasSecretarias.get("/secretarias/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const secretaria = await prisma.secretaria.findUnique({ where: { id }, omit: SIN_CONTRASENA });
  if (!secretaria) {
    return res.status(404).json({ error: "No existe una secretaria con ese id" });
  }
  res.json(secretaria);
});

// PATCH /api/secretarias/:id
// La secretaria cambia su perfil. Todos los campos son opcionales: nombre, email, telefono, domicilio,
// turnoTrabajo, fotoUri (null para sacar la foto) y estado ("activo" | "licencia").
rutasSecretarias.patch("/secretarias/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const secretaria = await prisma.secretaria.findUnique({ where: { id } });
  if (!secretaria) {
    return res.status(404).json({ error: "No existe una secretaria con ese id" });
  }

  const { nombre, email, telefono, domicilio, turnoTrabajo, fotoUri, estado } = req.body;
  const data: {
    nombre?: string;
    email?: string;
    telefono?: string;
    domicilio?: string;
    turnoTrabajo?: string;
    fotoUri?: string | null;
    estado?: string;
  } = {};

  if (nombre !== undefined) {
    if (!texto(nombre)) {
      return res.status(400).json({ error: "El nombre no puede quedar vacío" });
    }
    data.nombre = texto(nombre);
  }
  if (email !== undefined) {
    if (!esEmail(email)) {
      return res.status(400).json({ error: "El email no es valido" });
    }
    const correo = texto(email).toLowerCase();
    const repetido = await prisma.secretaria.findFirst({
      where: { consultorioId: secretaria.consultorioId, email: correo, id: { not: id } },
    });
    if (repetido) {
      return res.status(409).json({ error: "Ya hay otra secretaria con ese email" });
    }
    data.email = correo;
  }
  if (telefono !== undefined) data.telefono = texto(telefono);
  if (domicilio !== undefined) data.domicilio = texto(domicilio);
  if (turnoTrabajo !== undefined) data.turnoTrabajo = texto(turnoTrabajo);
  if (fotoUri !== undefined) data.fotoUri = fotoUri === null ? null : String(fotoUri);
  if (estado !== undefined) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: "El estado no es valido" });
    }
    data.estado = estado;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const actualizada = await prisma.secretaria.update({ where: { id }, data, omit: SIN_CONTRASENA });
  res.json(actualizada);
});

// PATCH /api/secretarias/:id/contrasena
// Cambia la contraseña. Recibe { actual, nueva }: hay que saber la actual para poder cambiarla.
// Responde 204 (sin cuerpo) si salió bien.
rutasSecretarias.patch("/secretarias/:id/contrasena", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const { actual, nueva } = req.body;
  if (String(nueva ?? "").length < 6) {
    return res.status(400).json({ error: "La contraseña nueva tiene que tener al menos 6 caracteres" });
  }

  const secretaria = await prisma.secretaria.findUnique({ where: { id } });
  if (!secretaria) {
    return res.status(404).json({ error: "No existe una secretaria con ese id" });
  }
  if (!contrasenaCorrecta(String(actual ?? ""), secretaria.contrasena)) {
    return res.status(400).json({ error: "La contraseña actual no es correcta" });
  }

  await prisma.secretaria.update({ where: { id }, data: { contrasena: cifrarContrasena(String(nueva)) } });
  res.status(204).end();
});
