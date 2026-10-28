import { Router } from "express";

import { contrasenaCorrecta } from "../contrasenas";
import { prisma } from "../prisma";
import { parseId } from "../validaciones";

// Rutas de inicio de sesión. Se montan en /api (ver index.ts).
export const rutasLogin = Router();

// Los roles que pueden iniciar sesión: cada uno se busca en su tabla.
const ROLES = ["paciente", "medico", "secretaria"];

// POST /api/login
// Recibe { consultorioId, rol, email, contrasena } y, si son correctos, devuelve los datos de esa persona
// (nunca su contraseña). La app guarda esos datos en la sesión.
rutasLogin.post("/login", async (req, res) => {
  const { consultorioId, rol, email, contrasena } = req.body;

  const idConsultorio = parseId(consultorioId);
  if (!idConsultorio || !String(email ?? "").trim() || !String(contrasena ?? "")) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  if (!ROLES.includes(rol)) {
    return res.status(400).json({ error: "El rol no es valido" });
  }

  // El email se busca sin espacios y en minúsculas, así "Paz@T.com " también sirve.
  const correo = String(email).trim().toLowerCase();
  const filtro = { consultorioId: idConsultorio, email: correo };

  // Se busca a la persona en la tabla de su rol y se arma lo que se devuelve.
  let contrasenaGuardada = "";
  let usuario = null;
  if (rol === "paciente") {
    const paciente = await prisma.paciente.findFirst({ where: filtro });
    if (paciente) {
      contrasenaGuardada = paciente.contrasena;
      usuario = { rol: rol, id: paciente.id, nombre: `${paciente.nombre} ${paciente.apellido}`, consultorioId: idConsultorio };
    }
  } else if (rol === "medico") {
    const medico = await prisma.medico.findFirst({ where: filtro });
    // Un médico dado de baja ya no puede entrar.
    if (medico && medico.estado !== "baja") {
      contrasenaGuardada = medico.contrasena;
      usuario = { rol: rol, id: medico.id, nombre: medico.nombre, consultorioId: idConsultorio };
    }
  } else {
    const secretaria = await prisma.secretaria.findFirst({ where: filtro });
    if (secretaria) {
      contrasenaGuardada = secretaria.contrasena;
      usuario = { rol: rol, id: secretaria.id, nombre: secretaria.nombre, consultorioId: idConsultorio };
    }
  }

  // El mismo mensaje si no existe el email o si la contraseña está mal: así no se revela qué emails existen.
  if (!usuario || !contrasenaCorrecta(String(contrasena), contrasenaGuardada)) {
    return res.status(401).json({ error: "Email o contraseña incorrectos" });
  }

  res.json(usuario);
});
