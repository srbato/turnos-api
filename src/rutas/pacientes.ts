import { Router } from "express";

import { cifrarContrasena, contrasenaCorrecta } from "../contrasenas";
import { prisma } from "../prisma";
import { esEmail, formatearDni, parseId, soloNumeros, texto } from "../validaciones";

// Rutas de los pacientes. Se montan en /api (ver index.ts).
export const rutasPacientes = Router();

// -----------------------------------------------------------------------------
// Datos y funciones auxiliares
// -----------------------------------------------------------------------------

// Lo que se devuelve de cada paciente: sus datos (sin la contraseña) y sus obras sociales con el nombre.
const SIN_CONTRASENA = { contrasena: true }; // omit: Prisma no trae ese campo
const CON_COBERTURAS = { coberturas: { include: { cobertura: true } } };

type CoberturaRecibida = { id: string; numeroAfiliado: string };

// Revisa la lista de obras sociales recibida: [{ id, numeroAfiliado }].
// Devuelve la lista limpia, o un texto con el error.
async function leerCoberturas(coberturas: unknown): Promise<CoberturaRecibida[] | string> {
  if (!Array.isArray(coberturas) || coberturas.length === 0) {
    return "Elegí al menos una obra social";
  }
  const limpias: CoberturaRecibida[] = [];
  for (const cobertura of coberturas) {
    const id = texto(cobertura?.id);
    const existe = await prisma.cobertura.findUnique({ where: { id } });
    if (!existe) {
      return `No existe la obra social "${id}"`;
    }
    limpias.push({ id: id, numeroAfiliado: texto(cobertura.numeroAfiliado) });
  }
  return limpias;
}

// -----------------------------------------------------------------------------
// Rutas
// -----------------------------------------------------------------------------

// GET /api/pacientes?consultorioId=1
// Devuelve los pacientes de un consultorio, ordenados por apellido.
rutasPacientes.get("/pacientes", async (req, res) => {
  const consultorioId = parseId(req.query.consultorioId);
  if (!consultorioId) {
    return res.status(400).json({ error: "Falta el consultorio" });
  }

  const pacientes = await prisma.paciente.findMany({
    where: { consultorioId },
    omit: SIN_CONTRASENA,
    include: CON_COBERTURAS,
    orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
  });
  res.json(pacientes);
});

// GET /api/pacientes/:id
rutasPacientes.get("/pacientes/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const paciente = await prisma.paciente.findUnique({ where: { id }, omit: SIN_CONTRASENA, include: CON_COBERTURAS });
  if (!paciente) {
    return res.status(404).json({ error: "No existe un paciente con ese id" });
  }
  res.json(paciente);
});

// POST /api/pacientes
// Registro de un paciente nuevo. Recibe { consultorioId, nombre, apellido, dni, email, telefono, domicilio,
// alergias, contrasena, coberturas: [{ id, numeroAfiliado }] }. Valida lo mismo que la pantalla de registro.
rutasPacientes.post("/pacientes", async (req, res) => {
  const { consultorioId, nombre, apellido, dni, email, telefono, domicilio, alergias, contrasena, coberturas } = req.body;

  const idConsultorio = parseId(consultorioId);
  if (!idConsultorio || !texto(nombre) || !texto(apellido)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  const numerosDni = soloNumeros(dni);
  if (numerosDni.length < 7 || numerosDni.length > 8) {
    return res.status(400).json({ error: "El DNI tiene que tener 7 u 8 números" });
  }
  if (!esEmail(email)) {
    return res.status(400).json({ error: "El email no es valido" });
  }
  if (soloNumeros(telefono).length < 8) {
    return res.status(400).json({ error: "El teléfono tiene que tener al menos 8 números" });
  }
  if (texto(domicilio).length < 5) {
    return res.status(400).json({ error: "Falta el domicilio" });
  }
  if (String(contrasena ?? "").length < 6) {
    return res.status(400).json({ error: "La contraseña tiene que tener al menos 6 caracteres" });
  }
  const listaCoberturas = await leerCoberturas(coberturas);
  if (typeof listaCoberturas === "string") {
    return res.status(400).json({ error: listaCoberturas });
  }

  const consultorio = await prisma.consultorio.findUnique({ where: { id: idConsultorio } });
  if (!consultorio) {
    return res.status(404).json({ error: "No existe ese consultorio" });
  }

  // En un consultorio no puede haber dos pacientes con el mismo DNI o el mismo email.
  const dniFormateado = formatearDni(numerosDni);
  const correo = texto(email).toLowerCase();
  const repetido = await prisma.paciente.findFirst({
    where: { consultorioId: idConsultorio, OR: [{ dni: dniFormateado }, { email: correo }] },
  });
  if (repetido) {
    return res.status(409).json({ error: "Ya hay un paciente registrado con ese DNI o ese email" });
  }

  const paciente = await prisma.paciente.create({
    data: {
      consultorioId: idConsultorio,
      nombre: texto(nombre),
      apellido: texto(apellido),
      dni: dniFormateado,
      email: correo,
      telefono: texto(telefono),
      domicilio: texto(domicilio),
      alergias: texto(alergias),
      contrasena: cifrarContrasena(String(contrasena)),
    },
  });
  for (const cobertura of listaCoberturas) {
    await prisma.pacienteCobertura.create({
      data: { pacienteId: paciente.id, coberturaId: cobertura.id, numeroAfiliado: cobertura.numeroAfiliado },
    });
  }

  const creado = await prisma.paciente.findUnique({
    where: { id: paciente.id },
    omit: SIN_CONTRASENA,
    include: CON_COBERTURAS,
  });
  res.status(201).json(creado);
});

// PATCH /api/pacientes/:id
// Cambia datos del paciente. Todos los campos son opcionales: nombre, apellido, dni, email, telefono, domicilio,
// alergias, alerta (el aviso para el médico), fotoUri (null para sacar la foto) y coberturas (reemplaza la lista).
rutasPacientes.patch("/pacientes/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const paciente = await prisma.paciente.findUnique({ where: { id } });
  if (!paciente) {
    return res.status(404).json({ error: "No existe un paciente con ese id" });
  }

  const { nombre, apellido, dni, email, telefono, domicilio, alergias, alerta, fotoUri, coberturas } = req.body;
  const data: {
    nombre?: string;
    apellido?: string;
    dni?: string;
    email?: string;
    telefono?: string;
    domicilio?: string;
    alergias?: string;
    alerta?: string;
    fotoUri?: string | null;
  } = {};

  if (nombre !== undefined) {
    if (!texto(nombre)) {
      return res.status(400).json({ error: "El nombre no puede quedar vacío" });
    }
    data.nombre = texto(nombre);
  }
  if (apellido !== undefined) {
    if (!texto(apellido)) {
      return res.status(400).json({ error: "El apellido no puede quedar vacío" });
    }
    data.apellido = texto(apellido);
  }
  if (dni !== undefined) {
    const numerosDni = soloNumeros(dni);
    if (numerosDni.length < 7 || numerosDni.length > 8) {
      return res.status(400).json({ error: "El DNI tiene que tener 7 u 8 números" });
    }
    data.dni = formatearDni(numerosDni);
  }
  if (email !== undefined) {
    if (!esEmail(email)) {
      return res.status(400).json({ error: "El email no es valido" });
    }
    data.email = texto(email).toLowerCase();
  }
  if (telefono !== undefined) data.telefono = texto(telefono);
  if (domicilio !== undefined) data.domicilio = texto(domicilio);
  if (alergias !== undefined) data.alergias = texto(alergias);
  if (alerta !== undefined) data.alerta = texto(alerta);
  if (fotoUri !== undefined) data.fotoUri = fotoUri === null ? null : String(fotoUri);

  // Si cambia el DNI o el email, no puede quedar igual al de otro paciente del consultorio.
  if (data.dni || data.email) {
    const repetido = await prisma.paciente.findFirst({
      where: {
        consultorioId: paciente.consultorioId,
        id: { not: id },
        OR: [{ dni: data.dni ?? paciente.dni }, { email: data.email ?? paciente.email }],
      },
    });
    if (repetido) {
      return res.status(409).json({ error: "Ya hay otro paciente con ese DNI o ese email" });
    }
  }

  // Las obras sociales se reemplazan enteras: se borran las anteriores y se cargan las nuevas.
  let listaCoberturas: CoberturaRecibida[] | null = null;
  if (coberturas !== undefined) {
    const leidas = await leerCoberturas(coberturas);
    if (typeof leidas === "string") {
      return res.status(400).json({ error: leidas });
    }
    listaCoberturas = leidas;
  }

  if (Object.keys(data).length === 0 && listaCoberturas === null) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  await prisma.paciente.update({ where: { id }, data });
  if (listaCoberturas !== null) {
    await prisma.pacienteCobertura.deleteMany({ where: { pacienteId: id } });
    for (const cobertura of listaCoberturas) {
      await prisma.pacienteCobertura.create({
        data: { pacienteId: id, coberturaId: cobertura.id, numeroAfiliado: cobertura.numeroAfiliado },
      });
    }
  }

  const actualizado = await prisma.paciente.findUnique({ where: { id }, omit: SIN_CONTRASENA, include: CON_COBERTURAS });
  res.json(actualizado);
});

// PATCH /api/pacientes/:id/contrasena
// Cambia la contraseña. Recibe { actual, nueva }: hay que saber la actual para poder cambiarla.
// Responde 204 (sin cuerpo) si salió bien.
rutasPacientes.patch("/pacientes/:id/contrasena", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "El id no es valido" });
  }

  const { actual, nueva } = req.body;
  if (String(nueva ?? "").length < 6) {
    return res.status(400).json({ error: "La contraseña nueva tiene que tener al menos 6 caracteres" });
  }

  const paciente = await prisma.paciente.findUnique({ where: { id } });
  if (!paciente) {
    return res.status(404).json({ error: "No existe un paciente con ese id" });
  }
  if (!contrasenaCorrecta(String(actual ?? ""), paciente.contrasena)) {
    return res.status(400).json({ error: "La contraseña actual no es correcta" });
  }

  await prisma.paciente.update({ where: { id }, data: { contrasena: cifrarContrasena(String(nueva)) } });
  res.status(204).end();
});
