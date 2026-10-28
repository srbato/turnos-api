import crypto from "node:crypto";

// Las contraseñas nunca se guardan tal cual: se guarda un "hash", una versión cifrada que no se puede revertir.
// Para comprobar una contraseña se la vuelve a cifrar de la misma forma y se compara el resultado.
// Se usa scrypt, que viene con Node (módulo crypto): no hace falta instalar nada.
//
// A cada contraseña se le suma una "sal" (texto al azar), así dos personas con la misma contraseña no quedan
// con el mismo hash. Se guarda todo junto: "sal:hash".

// Cifra una contraseña para guardarla en la base.
export function cifrarContrasena(contrasena: string) {
  const sal = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(contrasena, sal, 64).toString("hex");
  return `${sal}:${hash}`;
}

// ¿La contraseña escrita coincide con la guardada?
export function contrasenaCorrecta(contrasena: string, guardada: string) {
  const [sal, hash] = guardada.split(":");
  const hashEscrita = crypto.scryptSync(contrasena, sal, 64).toString("hex");
  return hashEscrita === hash;
}
