// Carga los datos de ejemplo de MiConsultorio en la base (los mismos que usaba la app antes de tener backend).
// Se ejecuta con npm run db:init, después de que "prisma db push" crea las tablas a partir de prisma/schema.prisma.
// Solo carga los datos si la base está vacía: correrlo dos veces no duplica nada.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// -----------------------------------------------------------------------------
// Fechas de los turnos de ejemplo
// -----------------------------------------------------------------------------

// Muchos turnos de ejemplo son "de hoy" o "dentro de N días", así siempre hay algo en las agendas.

// Una fecha (Date) como texto 'AAAA-MM-DD', el formato en que se guardan los turnos.
function fechaComoTexto(fecha: Date) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

// La fecha dentro de N días (con N negativo, hace N días).
function fechaDentroDe(dias: number) {
  const hoy = new Date();
  return fechaComoTexto(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias));
}

// La primera fecha, desde dentro de "minimoDias" días, que cae en uno de esos días de la semana (0 = domingo).
// Sirve para que un turno de ejemplo caiga en un día en que el médico atiende.
function fechaDeAtencion(minimoDias: number, diasSemana: number[]) {
  const hoy = new Date();
  let dias = minimoDias;
  while (!diasSemana.includes(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias).getDay())) {
    dias++;
  }
  return fechaDentroDe(dias);
}

const HOY = fechaDentroDe(0);
const LUNES_A_VIERNES = [1, 2, 3, 4, 5];

// -----------------------------------------------------------------------------
// Horarios de los médicos
// -----------------------------------------------------------------------------

type Franja = { dia: number; desde: string; hasta: string };

// La misma franja para varios días de la semana.
function franjasDe(dias: number[], desde: string, hasta: string) {
  const franjas: Franja[] = [];
  dias.forEach((dia) => {
    franjas.push({ dia: dia, desde: desde, hasta: hasta });
  });
  return franjas;
}

// El horario de un médico que no tiene uno especial: de lunes a viernes, de 9 a 12 y de 15 a 17:20.
const FRANJAS_POR_DEFECTO = [
  ...franjasDe(LUNES_A_VIERNES, "09:00", "12:00"),
  ...franjasDe(LUNES_A_VIERNES, "15:00", "17:20"),
];

// -----------------------------------------------------------------------------
// Datos de ejemplo
// -----------------------------------------------------------------------------

// Obras sociales. Las tres primeras son las que se pueden elegir en la app; el resto son las de pacientes de ejemplo.
const COBERTURAS = [
  { id: "swiss-smg20", nombre: "Swiss Medical SMG20" },
  { id: "osde-210", nombre: "OSDE 210" },
  { id: "galeno-220", nombre: "Galeno 220" },
  { id: "osde-310", nombre: "OSDE 310" },
  { id: "galeno-oro", nombre: "Galeno Oro" },
  { id: "galeno-plata", nombre: "Galeno Plata" },
  { id: "medife-bronce", nombre: "Medifé Bronce" },
  { id: "pami", nombre: "PAMI" },
];

type PacienteDeEjemplo = {
  clave: string; // para relacionarlo con sus turnos, recetas y estudios
  dni: string;
  nombre: string;
  apellido: string;
  email: string;
  alergias: string;
  alerta: string;
  faltas: number;
  asistencias: number;
  coberturas: { id: string; numeroAfiliado: string }[];
};

type MedicoDeEjemplo = {
  nombre: string;
  iniciales: string;
  especialidad: string;
  sala: string;
  matricula: string;
  email: string;
  coberturaIds: string[];
  franjas: Franja[];
  estado: string;
  licenciaHasta: string | null;
};

type SecretariaDeEjemplo = {
  nombre: string;
  dni: string;
  email: string;
  turnoTrabajo: string;
};

type TurnoDeEjemplo = {
  paciente: string; // clave del paciente
  medico: string; // nombre del médico
  fecha: string;
  hora: string;
  estado: string;
  instrucciones: string[];
  adelantoDesde: string | null;
  reservadoEl: string;
  consulta: { motivo: string; diagnostico: string; indicaciones: string; notas: string } | null;
};

// Arma un turno de ejemplo: lo que no se pasa queda con su valor habitual.
function turno(paciente: string, medico: string, fecha: string, hora: string, estado: string): TurnoDeEjemplo {
  return {
    paciente: paciente,
    medico: medico,
    fecha: fecha,
    hora: hora,
    estado: estado,
    instrucciones: [],
    adelantoDesde: null,
    reservadoEl: HOY,
    consulta: null,
  };
}

const PAZ = "Dr. Ricardo Paz";
const FERNANDEZ = "Dra. Lucía Fernández";

// ----- Consultorios Rivadavia -----

const PACIENTES_RIVADAVIA: PacienteDeEjemplo[] = [
  // Valentín es el paciente que usa la app (con los datos de su perfil).
  {
    clave: "p1",
    dni: "40.123.456",
    nombre: "Valentín",
    apellido: "Michelic",
    email: "valentin@test.com",
    alergias: "penicilina",
    alerta: "",
    faltas: 0,
    asistencias: 4,
    coberturas: [
      { id: "swiss-smg20", numeroAfiliado: "62-4418902/01" },
      { id: "osde-210", numeroAfiliado: "" },
    ],
  },
  {
    clave: "p2",
    dni: "41.220.118",
    nombre: "Sofía",
    apellido: "Gutiérrez",
    email: "sofia@test.com",
    alergias: "ninguna",
    alerta: "",
    faltas: 0,
    asistencias: 6,
    coberturas: [{ id: "osde-210", numeroAfiliado: "31-5566778/02" }],
  },
  {
    clave: "p3",
    dni: "33.907.554",
    nombre: "Martín",
    apellido: "Bianchi",
    email: "martin@test.com",
    alergias: "aspirina",
    alerta: "Interacción medicamentosa detectada",
    faltas: 2,
    asistencias: 1,
    coberturas: [{ id: "medife-bronce", numeroAfiliado: "44-1122334/01" }],
  },
  {
    clave: "p4",
    dni: "12.554.903",
    nombre: "Jorge",
    apellido: "Almirón",
    email: "jorge@test.com",
    alergias: "ninguna",
    alerta: "",
    faltas: 0,
    asistencias: 2,
    coberturas: [{ id: "pami", numeroAfiliado: "15-9988776/00" }],
  },
  {
    clave: "p5",
    dni: "38.671.240",
    nombre: "Camila",
    apellido: "Rossi",
    email: "camila@test.com",
    alergias: "látex",
    alerta: "",
    faltas: 3,
    asistencias: 0,
    coberturas: [{ id: "galeno-oro", numeroAfiliado: "27-3344556/01" }],
  },
  {
    clave: "p6",
    dni: "10.348.771",
    nombre: "Elsa",
    apellido: "Domínguez",
    email: "elsa@test.com",
    alergias: "ninguna",
    alerta: "",
    faltas: 0,
    asistencias: 9,
    coberturas: [{ id: "pami", numeroAfiliado: "15-1234567/00" }],
  },
];

const MEDICOS_RIVADAVIA: MedicoDeEjemplo[] = [
  {
    nombre: PAZ,
    iniciales: "RP",
    especialidad: "Cardiología",
    sala: "Consultorio 5",
    matricula: "MN 104.233",
    email: "paz@t.com",
    coberturaIds: ["swiss-smg20", "galeno-220"],
    franjas: FRANJAS_POR_DEFECTO,
    estado: "activo",
    licenciaHasta: null,
  },
  {
    nombre: "Dra. Ana Torres",
    iniciales: "AT",
    especialidad: "Cardiología",
    sala: "Consultorio 4",
    matricula: "MN 121.876",
    email: "torres@t.com",
    coberturaIds: ["osde-210"],
    // Miércoles a la tarde y viernes a la mañana.
    franjas: [...franjasDe([3], "14:00", "20:00"), ...franjasDe([5], "09:00", "13:00")],
    estado: "activo",
    licenciaHasta: null,
  },
  {
    nombre: FERNANDEZ,
    iniciales: "LF",
    especialidad: "Clínica médica",
    sala: "Consultorio 3",
    matricula: "MN 118.402",
    email: "m@t.com",
    coberturaIds: ["swiss-smg20", "osde-210"],
    franjas: FRANJAS_POR_DEFECTO,
    estado: "activo",
    licenciaHasta: null,
  },
  {
    nombre: "Dra. Mariela Sosa",
    iniciales: "MS",
    especialidad: "Pediatría",
    sala: "Consultorio 1",
    matricula: "MN 098.551",
    email: "sosa@t.com",
    coberturaIds: ["osde-210"],
    franjas: franjasDe([1, 3, 5], "08:00", "12:00"),
    estado: "licencia",
    licenciaHasta: fechaDentroDe(14),
  },
  {
    nombre: "Dr. Gustavo Ibáñez",
    iniciales: "GI",
    especialidad: "Traumatología",
    sala: "Consultorio 2",
    matricula: "MN 112.640",
    email: "ibanez@t.com",
    coberturaIds: ["swiss-smg20"],
    franjas: franjasDe(LUNES_A_VIERNES, "10:00", "14:00"),
    estado: "activo",
    licenciaHasta: null,
  },
  {
    nombre: "Dr. Héctor Duarte",
    iniciales: "HD",
    especialidad: "Cardiología",
    sala: "Consultorio 6",
    matricula: "MN 109.775",
    email: "duarte@t.com",
    coberturaIds: ["galeno-220"],
    franjas: FRANJAS_POR_DEFECTO,
    estado: "activo",
    licenciaHasta: null,
  },
];

const SECRETARIAS_RIVADAVIA: SecretariaDeEjemplo[] = [
  {
    nombre: "Norma Aguilar",
    dni: "28.774.310",
    email: "norma.aguilar@consultoriosrivadavia.com",
    turnoTrabajo: "Lunes a viernes · 8:00 a 16:00",
  },
  {
    nombre: "Carolina Ríos",
    dni: "31.452.907",
    email: "carolina.rios@consultoriosrivadavia.com",
    turnoTrabajo: "Lunes a viernes · 13:00 a 20:00",
  },
];

function turnosRivadavia() {
  const turnos: TurnoDeEjemplo[] = [];

  // ----- Turnos de Valentín -----
  const primero = turno("p1", FERNANDEZ, "2026-09-29", "10:30", "confirmado");
  primero.instrucciones = ["Ayuno de 8 horas antes del turno", "Llevá la orden de Swiss Medical"];
  turnos.push(primero);
  turnos.push(turno("p1", PAZ, "2026-10-03", "09:00", "pendiente"));
  turnos.push(turno("p1", "Dra. Mariela Sosa", "2026-09-20", "16:00", "cancelado"));
  turnos.push(turno("p1", "Dr. Gustavo Ibáñez", fechaDeAtencion(4, LUNES_A_VIERNES), "11:15", "confirmado"));

  // ----- Turnos de hoy en la agenda de la Dra. Fernández -----
  turnos.push(turno("p2", FERNANDEZ, HOY, "09:00", "confirmado"));
  turnos.push(turno("p3", FERNANDEZ, HOY, "09:20", "ausente"));
  turnos.push(turno("p4", FERNANDEZ, HOY, "09:40", "ausente"));
  turnos.push(turno("p5", FERNANDEZ, HOY, "10:00", "pendiente"));
  const elsa = turno("p6", FERNANDEZ, HOY, "11:00", "confirmado");
  elsa.reservadoEl = "2026-06-20";
  turnos.push(elsa);

  // ----- Turnos de hoy en la agenda del Dr. Paz -----
  turnos.push(turno("p4", PAZ, HOY, "15:00", "pendiente"));
  turnos.push(turno("p5", PAZ, HOY, "15:40", "confirmado"));
  turnos.push(turno("p3", PAZ, HOY, "16:20", "cancelado")); // horario liberado para la lista de espera

  // ----- Lista de espera: un horario liberado con Paz y dos pacientes que quieren adelantar -----
  turnos.push(turno("p6", PAZ, fechaDeAtencion(4, LUNES_A_VIERNES), "09:20", "cancelado"));
  const valentinEspera = turno("p1", PAZ, fechaDeAtencion(12, LUNES_A_VIERNES), "10:00", "confirmado");
  valentinEspera.adelantoDesde = "2026-09-20"; // espera hace más tiempo: es el primero de la lista
  turnos.push(valentinEspera);
  const jorgeEspera = turno("p4", PAZ, fechaDeAtencion(9, LUNES_A_VIERNES), "15:00", "pendiente");
  jorgeEspera.adelantoDesde = "2026-09-28";
  turnos.push(jorgeEspera);

  // ----- Consultas anteriores (la historia clínica de ejemplo) -----
  const faringitis = turno("p2", FERNANDEZ, fechaDeAtencion(-40, LUNES_A_VIERNES), "10:00", "atendido");
  faringitis.consulta = {
    motivo: "Dolor de garganta y fiebre desde hace 3 días",
    diagnostico: "Faringitis aguda",
    indicaciones: "Ibuprofeno 400 mg cada 8 horas por 5 días. Tomar mucho líquido. Volver si la fiebre sigue en 3 días.",
    notas: "Sin placas. Si se repite, pedir hisopado.",
  };
  turnos.push(faringitis);
  const control = turno("p2", FERNANDEZ, fechaDeAtencion(-12, LUNES_A_VIERNES), "09:40", "atendido");
  control.consulta = {
    motivo: "Control después de la faringitis",
    diagnostico: "Faringitis resuelta",
    indicaciones: "Alta. No hace falta medicación.",
    notas: "",
  };
  turnos.push(control);
  const presion = turno("p1", PAZ, fechaDeAtencion(-25, LUNES_A_VIERNES), "15:20", "atendido");
  presion.consulta = {
    motivo: "Control de presión",
    diagnostico: "Hipertensión arterial controlada",
    indicaciones: "Seguir con enalapril 10 mg a la mañana. Control en 3 meses con electrocardiograma.",
    notas: "",
  };
  turnos.push(presion);

  return turnos;
}

const RECETAS_RIVADAVIA = [
  {
    paciente: "p1",
    medico: PAZ,
    medicamento: "Enalapril 10 mg",
    indicacion: "1 comprimido cada 24 h (8:00 h)",
    fechaEmision: "2026-09-28",
    vigenciaDias: 30,
    codigo: "RX-2026-0481",
  },
  {
    paciente: "p1",
    medico: FERNANDEZ,
    medicamento: "Levotiroxina 50 mcg",
    indicacion: "1 comprimido en ayunas",
    fechaEmision: "2026-09-29",
    vigenciaDias: 60,
    codigo: "RX-2026-0497",
  },
  {
    paciente: "p1",
    medico: FERNANDEZ,
    medicamento: "Vitamina D 2000 UI",
    indicacion: "1 gota por día con el almuerzo",
    fechaEmision: "2026-08-01",
    vigenciaDias: 30,
    codigo: "RX-2026-0352",
  },
  {
    paciente: "p2",
    medico: FERNANDEZ,
    medicamento: "Atorvastatina 10 mg",
    indicacion: "1 comprimido por noche",
    fechaEmision: "2026-09-15",
    vigenciaDias: 30,
    codigo: "RX-2026-0301",
  },
  {
    paciente: "p5",
    medico: PAZ,
    medicamento: "Bisoprolol 2,5 mg",
    indicacion: "1 comprimido por la mañana",
    fechaEmision: "2026-09-22",
    vigenciaDias: 30,
    codigo: "RX-2026-0338",
  },
];

// Los estudios de ejemplo son de Valentín.
const ESTUDIOS_VALENTIN = [
  {
    medico: FERNANDEZ,
    tipo: "LAB",
    titulo: "Laboratorio completo",
    detalle: "Orden vence el 30/10",
    indicaciones: ["Ayuno de 8 horas", "Llevá la orden de Swiss Medical"],
    estado: "pendiente",
  },
  {
    medico: FERNANDEZ,
    tipo: "ECO",
    titulo: "Ecografía abdominal",
    detalle: "Turno a coordinar",
    indicaciones: ["Tomar 1 litro de agua una hora antes", "No orinar hasta después del estudio"],
    estado: "pendiente",
  },
  {
    medico: PAZ,
    tipo: "RX",
    titulo: "Radiografía de tórax",
    detalle: "Realizado el 12/08",
    indicaciones: [],
    estado: "realizado",
  },
  {
    medico: PAZ,
    tipo: "ECG",
    titulo: "Electrocardiograma",
    detalle: "Realizado el 02/07",
    indicaciones: [],
    estado: "realizado",
  },
  {
    medico: PAZ,
    tipo: "LAB",
    titulo: "Perfil lipídico",
    detalle: "Orden vencida el 15/09",
    indicaciones: ["Ayuno de 12 horas"],
    estado: "vencido",
  },
];

// ----- Centro Médico Belgrano (segundo consultorio) -----

// Valentín (mismo DNI) también se atiende acá, con otra obra social y su propio historial.
const PACIENTES_BELGRANO: PacienteDeEjemplo[] = [
  {
    clave: "b1",
    dni: "40.123.456",
    nombre: "Valentín",
    apellido: "Michelic",
    email: "valentin@test.com",
    alergias: "ninguna",
    alerta: "",
    faltas: 1,
    asistencias: 0,
    coberturas: [{ id: "osde-310", numeroAfiliado: "31-7788990/03" }],
  },
  {
    clave: "b2",
    dni: "36.418.092",
    nombre: "Lucas",
    apellido: "Herrera",
    email: "lucas@test.com",
    alergias: "ninguna",
    alerta: "",
    faltas: 0,
    asistencias: 3,
    coberturas: [{ id: "galeno-plata", numeroAfiliado: "27-1100223/01" }],
  },
];

const MEDICOS_BELGRANO: MedicoDeEjemplo[] = [
  {
    nombre: "Dr. Tomás Quiroga",
    iniciales: "TQ",
    especialidad: "Dermatología",
    sala: "Consultorio 1",
    matricula: "MN 130.912",
    email: "quiroga@t.com",
    coberturaIds: ["osde-210", "galeno-220"],
    franjas: FRANJAS_POR_DEFECTO,
    estado: "activo",
    licenciaHasta: null,
  },
];

const SECRETARIAS_BELGRANO: SecretariaDeEjemplo[] = [
  {
    nombre: "Julieta Ponce",
    dni: "33.208.645",
    email: "julieta.ponce@centrobelgrano.com",
    turnoTrabajo: "Lunes a viernes · 9:00 a 17:00",
  },
];

// -----------------------------------------------------------------------------
// Funciones que guardan cada cosa en la base
// -----------------------------------------------------------------------------

// Contraseñas de prueba (las mismas que usaba la app). En el paso del login se van a guardar cifradas.
const CONTRASENA_PACIENTE = "p";
const CONTRASENA_MEDICO = "m";
const CONTRASENA_SECRETARIA = "s";

// Ids que va generando la base, para relacionar después turnos, recetas y estudios.
const idsPacientes: Record<string, number> = {}; // clave del paciente -> id
const idsMedicos: Record<string, number> = {}; // nombre del médico -> id
const primeraCobertura: Record<string, string> = {}; // clave del paciente -> id de su primera obra social

async function guardarPacientes(consultorioId: number, pacientes: PacienteDeEjemplo[]) {
  for (const datos of pacientes) {
    const paciente = await prisma.paciente.create({
      data: {
        consultorioId: consultorioId,
        dni: datos.dni,
        nombre: datos.nombre,
        apellido: datos.apellido,
        email: datos.email,
        contrasena: CONTRASENA_PACIENTE,
        alergias: datos.alergias,
        alerta: datos.alerta,
        faltas: datos.faltas,
        asistencias: datos.asistencias,
      },
    });
    idsPacientes[datos.clave] = paciente.id;
    primeraCobertura[datos.clave] = datos.coberturas[0].id;

    for (const cobertura of datos.coberturas) {
      await prisma.pacienteCobertura.create({
        data: {
          pacienteId: paciente.id,
          coberturaId: cobertura.id,
          numeroAfiliado: cobertura.numeroAfiliado,
        },
      });
    }
  }
}

async function guardarMedicos(consultorioId: number, medicos: MedicoDeEjemplo[]) {
  for (const datos of medicos) {
    // Para las obras sociales que acepta se "conectan" las que ya existen en la tabla Cobertura.
    const coberturas = datos.coberturaIds.map((id) => ({ id: id }));
    const medico = await prisma.medico.create({
      data: {
        consultorioId: consultorioId,
        nombre: datos.nombre,
        iniciales: datos.iniciales,
        especialidad: datos.especialidad,
        sala: datos.sala,
        matricula: datos.matricula,
        email: datos.email,
        contrasena: CONTRASENA_MEDICO,
        estado: datos.estado,
        licenciaHasta: datos.licenciaHasta,
        coberturas: { connect: coberturas },
      },
    });
    idsMedicos[datos.nombre] = medico.id;

    for (const franja of datos.franjas) {
      await prisma.franjaHoraria.create({
        data: { medicoId: medico.id, dia: franja.dia, desde: franja.desde, hasta: franja.hasta },
      });
    }
  }
}

async function guardarSecretarias(consultorioId: number, secretarias: SecretariaDeEjemplo[]) {
  for (const datos of secretarias) {
    await prisma.secretaria.create({
      data: {
        consultorioId: consultorioId,
        nombre: datos.nombre,
        dni: datos.dni,
        email: datos.email,
        contrasena: CONTRASENA_SECRETARIA,
        turnoTrabajo: datos.turnoTrabajo,
      },
    });
  }
}

async function guardarTurnos(turnos: TurnoDeEjemplo[]) {
  for (const datos of turnos) {
    const nuevo = await prisma.turno.create({
      data: {
        pacienteId: idsPacientes[datos.paciente],
        medicoId: idsMedicos[datos.medico],
        coberturaId: primeraCobertura[datos.paciente],
        fecha: datos.fecha,
        hora: datos.hora,
        estado: datos.estado,
        instrucciones: datos.instrucciones.join("\n"),
        adelantoDesde: datos.adelantoDesde,
        reservadoEl: datos.reservadoEl,
      },
    });

    if (datos.consulta) {
      await prisma.consulta.create({
        data: {
          turnoId: nuevo.id,
          motivo: datos.consulta.motivo,
          diagnostico: datos.consulta.diagnostico,
          indicaciones: datos.consulta.indicaciones,
          notas: datos.consulta.notas,
        },
      });
    }
  }
}

// -----------------------------------------------------------------------------
// Carga de todos los datos de ejemplo
// -----------------------------------------------------------------------------

async function cargarDatosDeEjemplo() {
  // 1. Obras sociales (las usan los dos consultorios).
  for (const cobertura of COBERTURAS) {
    await prisma.cobertura.create({ data: cobertura });
  }

  // 2. Consultorios Rivadavia, con su gente y sus turnos.
  const rivadavia = await prisma.consultorio.create({
    data: {
      nombre: "Consultorios Rivadavia",
      direccion: "Av. Rivadavia 4120, CABA",
      ciudad: "CABA",
      telefono: "11 4903-7712",
      atencion: "Lun a vie 8–20 · sáb 9–13",
    },
  });
  await guardarPacientes(rivadavia.id, PACIENTES_RIVADAVIA);
  await guardarMedicos(rivadavia.id, MEDICOS_RIVADAVIA);
  await guardarSecretarias(rivadavia.id, SECRETARIAS_RIVADAVIA);
  await guardarTurnos(turnosRivadavia());

  for (const receta of RECETAS_RIVADAVIA) {
    await prisma.receta.create({
      data: {
        pacienteId: idsPacientes[receta.paciente],
        medicoId: idsMedicos[receta.medico],
        medicamento: receta.medicamento,
        indicacion: receta.indicacion,
        fechaEmision: receta.fechaEmision,
        vigenciaDias: receta.vigenciaDias,
        codigo: receta.codigo,
      },
    });
  }

  for (const estudio of ESTUDIOS_VALENTIN) {
    await prisma.estudio.create({
      data: {
        pacienteId: idsPacientes["p1"],
        medicoId: idsMedicos[estudio.medico],
        tipo: estudio.tipo,
        titulo: estudio.titulo,
        detalle: estudio.detalle,
        indicaciones: estudio.indicaciones.join("\n"),
        estado: estudio.estado,
      },
    });
  }

  await prisma.medicamentoPropio.create({
    data: { pacienteId: idsPacientes["p1"], nombre: "Ibuprofeno 400 mg", dosis: "Cada 8 h si hay dolor", motivo: "Dolor" },
  });

  // 3. Centro Médico Belgrano.
  const belgrano = await prisma.consultorio.create({
    data: { nombre: "Centro Médico Belgrano", direccion: "Av. Cabildo 2350, CABA", ciudad: "CABA" },
  });
  await guardarPacientes(belgrano.id, PACIENTES_BELGRANO);
  await guardarMedicos(belgrano.id, MEDICOS_BELGRANO);
  await guardarSecretarias(belgrano.id, SECRETARIAS_BELGRANO);
  await guardarTurnos([turno("b2", "Dr. Tomás Quiroga", fechaDentroDe(2), "10:00", "confirmado")]);
}

// -----------------------------------------------------------------------------
// Inicio
// -----------------------------------------------------------------------------

async function initDatabase() {
  // Si ya hay consultorios, la base tiene datos: no se vuelven a cargar.
  const cantidad = await prisma.consultorio.count();
  if (cantidad > 0) {
    console.log("La base ya tiene datos: no se cargan los de ejemplo. Para empezar de cero: npm run db:reset");
    return;
  }

  await cargarDatosDeEjemplo();
  console.log("Base de datos lista, con los datos de ejemplo");
}

initDatabase()
  .catch((error) => {
    console.error("No se pudo preparar la base de datos", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
