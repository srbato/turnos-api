// Lista de espera para adelantar turnos. Son las mismas reglas que usaba la app (datos/adelantos.ts), pero ahora las
// aplica el servidor, así todos ven las mismas ofertas:
//   - Al sacar un turno, el paciente puede anotarse para que le ofrezcan uno antes (el turno queda con "adelantoDesde").
//   - Solo se ofrecen horarios libres a 3 días o más de hoy, así el paciente tiene tiempo de responder.
//   - Se ofrece a quien ya tiene un turno más tarde con el mismo médico y hace más tiempo que espera.
//   - Cada paciente tiene como máximo UNA oferta pendiente, y cada horario se ofrece a UN solo paciente a la vez.
//   - Si un paciente no acepta (o no contesta), el horario pasa al siguiente de la lista.
//
// Un horario libre puede ser un turno cancelado (que nadie volvió a ocupar) o un horario que Secretaría publicó.
import { prisma } from "./prisma";
import { fechaDeHoy } from "./validaciones";

export const DIAS_MINIMOS_ADELANTO = 3;

// Un horario de la agenda de un médico.
type Horario = { medicoId: number; fecha: string; hora: string };

// Los datos de la base que hacen falta para decidir las ofertas (solo los campos que se usan).
type TurnoDeLaLista = {
  id: number;
  medicoId: number;
  fecha: string;
  hora: string;
  estado: string;
  motivoCancelacion: string | null;
  adelantoDesde: string | null;
};
type OfertaDeLaLista = {
  id: number;
  turnoId: number;
  fecha: string;
  hora: string;
  estado: string;
  turno: { medicoId: number };
};

// -----------------------------------------------------------------------------
// Funciones chicas
// -----------------------------------------------------------------------------

// Fecha y hora juntas, para comparar qué es antes: "2026-11-02 11:15".
function momento(fecha: string, hora: string) {
  return `${fecha} ${hora}`;
}

// Identifica un horario de un médico: "3|2026-11-02|11:15".
function clave(horario: Horario) {
  return `${horario.medicoId}|${horario.fecha}|${horario.hora}`;
}

// El horario que se ofrece en una oferta (el médico es el del turno del paciente).
function horarioDeLaOferta(oferta: OfertaDeLaLista): Horario {
  return { medicoId: oferta.turno.medicoId, fecha: oferta.fecha, hora: oferta.hora };
}

function estaActivo(turno: TurnoDeLaLista) {
  return turno.estado === "pendiente" || turno.estado === "confirmado";
}

// Días que faltan para una fecha (0 = hoy).
export function diasDesdeHoy(fecha: string) {
  const [a1, m1, d1] = fechaDeHoy().split("-").map(Number);
  const [a2, m2, d2] = fecha.split("-").map(Number);
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86400000);
}

// ¿Hay un turno activo en ese horario?
function ocupado(horario: Horario, turnos: TurnoDeLaLista[]) {
  return turnos.some(
    (t) => estaActivo(t) && t.medicoId === horario.medicoId && t.fecha === horario.fecha && t.hora === horario.hora
  );
}

// Una oferta sigue vigente si espera respuesta, el turno del paciente sigue activo y sigue siendo más tarde, y el
// horario ofrecido sigue libre.
function ofertaVigente(oferta: OfertaDeLaLista, turnos: TurnoDeLaLista[]) {
  const turno = turnos.find((t) => t.id === oferta.turnoId);
  return (
    oferta.estado === "enviada" &&
    turno !== undefined &&
    estaActivo(turno) &&
    momento(turno.fecha, turno.hora) > momento(oferta.fecha, oferta.hora) &&
    !ocupado(horarioDeLaOferta(oferta), turnos)
  );
}

// Los que esperan: turnos activos anotados en la lista, el que hace más tiempo que espera primero.
// Si empatan, primero el que tiene el turno más lejano.
function listaDeEspera(turnos: TurnoDeLaLista[]) {
  return turnos
    .filter((t) => t.adelantoDesde !== null && estaActivo(t) && t.fecha >= fechaDeHoy())
    .sort((a, b) => {
      if (a.adelantoDesde !== b.adelantoDesde) {
        return (a.adelantoDesde ?? "") < (b.adelantoDesde ?? "") ? -1 : 1;
      }
      return momento(a.fecha, a.hora) < momento(b.fecha, b.hora) ? 1 : -1;
    });
}

// Los horarios libres que se pueden ofrecer: los turnos cancelados por una persona (los que canceló el sistema tienen
// motivo: ese horario no existe) y los que publicó Secretaría. Tienen que estar libres, a 3 días o más, y no retirados.
function horariosParaOfrecer(turnos: TurnoDeLaLista[], publicados: Horario[], retirados: Horario[]) {
  const liberados: Horario[] = turnos
    .filter((t) => t.estado === "cancelado" && t.motivoCancelacion === null)
    .map((t) => ({ medicoId: t.medicoId, fecha: t.fecha, hora: t.hora }));
  const clavesRetiradas = retirados.map((horario) => clave(horario));

  const resultado: Horario[] = [];
  for (const horario of [...liberados, ...publicados]) {
    const yaEsta = resultado.some((otro) => clave(otro) === clave(horario));
    if (
      !yaEsta &&
      !ocupado(horario, turnos) &&
      diasDesdeHoy(horario.fecha) >= DIAS_MINIMOS_ADELANTO &&
      !clavesRetiradas.includes(clave(horario))
    ) {
      resultado.push(horario);
    }
  }
  return resultado.sort((a, b) => (momento(a.fecha, a.hora) < momento(b.fecha, b.hora) ? -1 : 1));
}

// A quiénes se les puede ofrecer un horario ahora, en orden: los de la lista del mismo médico con un turno más tarde,
// salvo los que ya respondieron por este horario y los que ya tienen otra oferta esperando respuesta.
function candidatos(horario: Horario, turnos: TurnoDeLaLista[], ofertas: OfertaDeLaLista[]) {
  const conOfertaVigente = ofertas.filter((o) => ofertaVigente(o, turnos)).map((o) => o.turnoId);
  return listaDeEspera(turnos).filter(
    (turno) =>
      turno.medicoId === horario.medicoId &&
      momento(turno.fecha, turno.hora) > momento(horario.fecha, horario.hora) &&
      !conOfertaVigente.includes(turno.id) &&
      !ofertas.some(
        (o) => o.turnoId === turno.id && clave(horarioDeLaOferta(o)) === clave(horario) && o.estado !== "enviada"
      )
  );
}

// -----------------------------------------------------------------------------
// Lo que usan las rutas
// -----------------------------------------------------------------------------

// Trae de la base todo lo de la lista de espera de un consultorio.
async function leerLista(consultorioId: number) {
  const delConsultorio = { medico: { consultorioId } };
  const turnos = await prisma.turno.findMany({ where: delConsultorio });
  const ofertas = await prisma.ofertaAdelanto.findMany({
    where: { turno: delConsultorio },
    include: { turno: { select: { medicoId: true } } },
  });
  const publicados = await prisma.horarioPublicado.findMany({ where: delConsultorio });
  const retirados = await prisma.horarioRetirado.findMany({ where: delConsultorio });
  return { turnos, ofertas, publicados, retirados };
}

// Envía las ofertas que falten: cada horario libre que no está ofrecido a nadie se le ofrece al primer candidato.
// Se llama después de cada cambio que puede liberar un horario o mover la lista (cancelar un turno, anotarse,
// responder una oferta, publicar un horario). Devuelve cuántas ofertas nuevas creó.
export async function enviarOfertasPendientes(consultorioId: number) {
  const { turnos, ofertas, publicados, retirados } = await leerLista(consultorioId);
  const clavesOfrecidas = ofertas.filter((o) => ofertaVigente(o, turnos)).map((o) => clave(horarioDeLaOferta(o)));

  let creadas = 0;
  for (const horario of horariosParaOfrecer(turnos, publicados, retirados)) {
    if (clavesOfrecidas.includes(clave(horario))) {
      continue; // ya está ofrecido a alguien que todavía no respondió
    }
    const primero = candidatos(horario, turnos, ofertas)[0];
    if (!primero) {
      continue; // nadie de la lista lo puede usar
    }
    const nueva = await prisma.ofertaAdelanto.create({
      data: { turnoId: primero.id, fecha: horario.fecha, hora: horario.hora },
      include: { turno: { select: { medicoId: true } } },
    });
    // Se suma a la lista, así el mismo paciente no recibe dos ofertas en esta misma vuelta.
    ofertas.push(nueva);
    clavesOfrecidas.push(clave(horario));
    creadas++;
  }
  return creadas;
}

// ¿Ese horario está ofrecido a un paciente de la lista que todavía no respondió? Mientras tanto queda reservado:
// no se le puede dar a otro. turnoIdIgnorado: el turno del paciente que recibió la oferta no se bloquea a sí mismo.
export async function horarioReservado(medicoId: number, fecha: string, hora: string, turnoIdIgnorado: number | null) {
  const medico = await prisma.medico.findUnique({ where: { id: medicoId } });
  if (!medico) {
    return false;
  }
  const { turnos, ofertas } = await leerLista(medico.consultorioId);
  return ofertas.some(
    (o) =>
      o.turno.medicoId === medicoId &&
      o.fecha === fecha &&
      o.hora === hora &&
      o.turnoId !== turnoIdIgnorado &&
      ofertaVigente(o, turnos)
  );
}

// Los ids de las ofertas de un consultorio que siguen vigentes (esperan respuesta y el horario sigue libre).
export async function idsDeOfertasVigentes(consultorioId: number) {
  const { turnos, ofertas } = await leerLista(consultorioId);
  return ofertas.filter((o) => ofertaVigente(o, turnos)).map((o) => o.id);
}

// ¿El turno del paciente ya tiene una oferta esperando respuesta? (un paciente tiene una oferta a la vez)
export async function tieneOfertaVigente(turnoId: number, consultorioId: number) {
  const { turnos, ofertas } = await leerLista(consultorioId);
  return ofertas.some((o) => o.turnoId === turnoId && ofertaVigente(o, turnos));
}

// ¿La oferta sigue vigente? (para responderla: no se puede aceptar una oferta vencida)
export async function esOfertaVigente(ofertaId: number) {
  const oferta = await prisma.ofertaAdelanto.findUnique({
    where: { id: ofertaId },
    include: { turno: { include: { medico: true } } },
  });
  if (!oferta) {
    return false;
  }
  const { turnos } = await leerLista(oferta.turno.medico.consultorioId);
  return ofertaVigente(oferta, turnos);
}
