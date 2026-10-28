// Reglas sobre cuándo atiende un médico. Las usan las rutas de turnos (para no dar turnos fuera de horario) y las de
// médicos (para cancelar los turnos que quedan fuera de horario cuando cambian sus franjas o su estado).
import { prisma } from "./prisma";
import { esHora, fechaDeHoy } from "./validaciones";

// Duraciones de turno que puede elegir Secretaría en Ajustes (minutos).
export const DURACIONES_DE_TURNO = [15, 20, 30, 45];

export type Franja = { dia: number; desde: string; hasta: string };

// Revisa una lista de franjas recibida en un pedido. Devuelve el error, o null si están bien.
// Cada franja necesita un día de la semana (0 a 6), dos horas 'HH:MM' con desde antes que hasta, y no puede pisarse
// con otra franja del mismo día.
export function errorEnFranjas(franjas: unknown) {
  if (!Array.isArray(franjas) || franjas.length === 0) {
    return "Hay que cargar al menos un horario de atención";
  }
  for (const franja of franjas) {
    if (!Number.isInteger(franja?.dia) || franja.dia < 0 || franja.dia > 6) {
      return "El día de un horario no es valido";
    }
    if (!esHora(franja.desde) || !esHora(franja.hasta)) {
      return "Las horas de un horario no son validas";
    }
    if (franja.desde >= franja.hasta) {
      return "En cada horario, la hora de inicio tiene que ser anterior a la de fin";
    }
  }
  // Dos franjas del mismo día no se pueden pisar.
  for (let i = 0; i < franjas.length; i++) {
    for (let j = i + 1; j < franjas.length; j++) {
      const a = franjas[i];
      const b = franjas[j];
      if (a.dia === b.dia && a.desde < b.hasta && b.desde < a.hasta) {
        return "Hay dos horarios del mismo día que se superponen";
      }
    }
  }
  return null;
}

type MedicoConFranjas = {
  estado: string;
  licenciaHasta: string | null;
  franjas: { dia: number; desde: string; hasta: string }[];
};

// Por qué el médico no atiende en esa fecha y hora, o null si atiende.
// El motivo queda guardado en los turnos que el sistema cancela, así Secretaría sabe qué decirle al paciente.
export function motivoSinAtencion(medico: MedicoConFranjas, fecha: string, hora: string) {
  if (medico.estado === "baja") {
    return "El médico ya no atiende en el consultorio.";
  }
  // La licencia dura hasta el día anterior a licenciaHasta (ese día ya vuelve). Sin fecha, es indefinida.
  if (medico.estado === "licencia" && (medico.licenciaHasta === null || fecha < medico.licenciaHasta)) {
    return "El médico está de licencia ese día.";
  }
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const diaDeLaSemana = new Date(anio, mes - 1, dia).getDay();
  const franjasDelDia = medico.franjas.filter((franja) => franja.dia === diaDeLaSemana);
  if (franjasDelDia.length === 0) {
    return "El médico no atiende ese día.";
  }
  if (!franjasDelDia.some((franja) => franja.desde <= hora && hora < franja.hasta)) {
    return "El médico no atiende en ese horario.";
  }
  return null;
}

// Cancela los turnos futuros de un médico que quedaron en un día u horario en que ya no atiende (porque cambiaron
// sus franjas, se tomó licencia o lo dieron de baja). Cada uno queda con su motivo. Devuelve cuántos canceló.
export async function cancelarTurnosSinAtencion(medicoId: number) {
  const medico = await prisma.medico.findUnique({ where: { id: medicoId }, include: { franjas: true } });
  if (!medico) {
    return 0;
  }

  const turnos = await prisma.turno.findMany({
    where: {
      medicoId: medicoId,
      fecha: { gte: fechaDeHoy() },
      estado: { in: ["pendiente", "confirmado"] },
    },
  });

  let cancelados = 0;
  for (const turno of turnos) {
    const motivo = motivoSinAtencion(medico, turno.fecha, turno.hora);
    if (motivo) {
      await prisma.turno.update({
        where: { id: turno.id },
        data: { estado: "cancelado", motivoCancelacion: motivo },
      });
      cancelados++;
    }
  }
  return cancelados;
}
