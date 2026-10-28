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

// Un texto sin espacios al principio ni al final. Si no llega nada (undefined o null), devuelve "".
export function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

// ¿Parece un email? (tiene arroba y punto, como pide la app al registrarse)
export function esEmail(valor: unknown) {
  const email = texto(valor);
  return email.includes("@") && email.includes(".");
}

// Deja solo los números: "40.123-456" -> "40123456".
export function soloNumeros(valor: unknown) {
  let numeros = "";
  for (const caracter of texto(valor)) {
    if (caracter >= "0" && caracter <= "9") {
      numeros += caracter;
    }
  }
  return numeros;
}

// Pone los puntos de un DNI: "40123456" -> "40.123.456", "7123456" -> "7.123.456".
export function formatearDni(numeros: string) {
  let resultado = "";
  for (let i = 0; i < numeros.length; i++) {
    const quedan = numeros.length - i;
    if (i > 0 && quedan % 3 === 0) {
      resultado += ".";
    }
    resultado += numeros[i];
  }
  return resultado;
}

// La fecha de hoy como texto 'AAAA-MM-DD', el formato en que se guardan los turnos.
export function fechaDeHoy() {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}
