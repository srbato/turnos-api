// Funciones chicas para validar lo que llega en los pedidos (parámetros de la URL y datos del body).

// Convierte el parámetro :id de la URL (o un id del body) a un número seguro para Prisma.
// Devuelve null si no es un número entero positivo.
export function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ¿Es una fecha válida con formato 'AAAA-MM-DD'? (por ejemplo '2026-10-12')
export function esFecha(texto: unknown): boolean {
  if (typeof texto !== "string" || texto.length !== 10 || texto[4] !== "-" || texto[7] !== "-") {
    return false;
  }
  const [anio, mes, dia] = texto.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  // new Date corrige fechas imposibles (31/02 pasa a 03/03): si cambió el mes o el día, no era válida.
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

// ¿Es una hora válida con formato 'HH:MM'? (por ejemplo '09:20')
export function esHora(texto: unknown): boolean {
  if (typeof texto !== "string" || texto.length !== 5 || texto[2] !== ":") {
    return false;
  }
  const horas = Number(texto.slice(0, 2));
  const minutos = Number(texto.slice(3));
  return Number.isInteger(horas) && Number.isInteger(minutos) && horas >= 0 && horas <= 23 && minutos >= 0 && minutos <= 59;
}

// La fecha de hoy como texto 'AAAA-MM-DD', el formato en que se guardan los turnos.
export function fechaDeHoy() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}
