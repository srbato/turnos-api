# MiConsultorio — Backend

API REST de MiConsultorio, hecha con **Express**, **Prisma** y **SQLite** (TypeScript).
La app (React Native + Expo) está en otro repositorio y se comunica con esta API por HTTP con JSON.

```
App (Expo)  →  HTTP + JSON  →  Express  →  Prisma  →  SQLite (prisma/dev.db)
```

## Requisitos

- Node.js 20 o más nuevo.

## Cómo levantarlo

1. Instalar las dependencias:

   ```
   npm install
   ```

2. Crear el archivo `.env` copiando `.env.example` (el `.env` no se sube al repositorio).

3. Crear la base de datos con los datos de ejemplo:

   ```
   npm run db:init
   ```

4. Levantar el servidor en modo desarrollo:

   ```
   npm run dev
   ```

5. Probar que responde: abrir http://localhost:3000/api/health. Tiene que devolver `{ "ok": true }`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Levanta la API y la reinicia sola al guardar cambios |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Levanta la versión compilada |
| `npm run prisma:generate` | Regenera el cliente de Prisma después de cambiar `prisma/schema.prisma` |
| `npm run db:init` | Crea las tablas a partir de `prisma/schema.prisma` y carga los datos de ejemplo (solo si la base está vacía) |
| `npm run db:reset` | Borra la base y la vuelve a crear con los datos de ejemplo |

## Rutas de la API

Todas empiezan con `/api` y responden JSON. Los errores vuelven como `{ "error": "..." }` con el código que
corresponde: 400 (datos inválidos), 401 (login incorrecto), 404 (no existe), 409 (choca con algo que ya existe,
como un horario ocupado) o 500 (error inesperado).

| Recurso | Rutas |
|---|---|
| Prueba | `GET /health` |
| Sesión | `POST /login` |
| Consultorio | `GET /consultorios/:id` · `PATCH /consultorios/:id` · `GET /coberturas` |
| Pacientes | `GET /pacientes?consultorioId=` · `GET /pacientes/:id` · `POST /pacientes` (registro) · `PATCH /pacientes/:id` · `PATCH /pacientes/:id/contrasena` |
| Médicos | `GET /medicos?consultorioId=` · `GET /medicos/:id` · `POST /medicos` · `PATCH /medicos/:id` · `PUT /medicos/:id/franjas` |
| Secretarias | `GET /secretarias?consultorioId=` · `GET /secretarias/:id` · `PATCH /secretarias/:id` · `PATCH /secretarias/:id/contrasena` |
| Turnos | `GET /turnos?consultorioId=` · `GET /turnos/:id` · `POST /turnos` · `PATCH /turnos/:id` · `PUT /turnos/:id/consulta` · `GET` y `PUT /turnos/:id/preconsulta` · `POST /turnos/:id/avisos` |
| Recetas | `GET /recetas?consultorioId=` · `POST /recetas` · `PATCH /recetas/:id` · `DELETE /recetas/:id` |
| Medicamentos propios | `GET /medicamentos?pacienteId=` · `POST /medicamentos` · `PATCH /medicamentos/:id` · `DELETE /medicamentos/:id` |
| Estudios | `GET /estudios?pacienteId=` · `GET /estudios/:id` |
| Lista de espera | `GET /ofertas?consultorioId=` · `POST /ofertas` · `PATCH /ofertas/:id` · `POST /ofertas/:id/reprogramar` · `GET` y `POST /horarios-publicados` · `GET /horarios-retirados` |

Cada ruta tiene un comentario arriba, en `src/rutas/`, que explica qué recibe y qué devuelve.

## Cómo está organizado

```
prisma/schema.prisma   las tablas de la base y sus relaciones
src/index.ts           arranque del servidor: middlewares, rutas y manejo de errores
src/rutas/             las rutas de cada recurso (un archivo por recurso)
src/atencion.ts        cuándo atiende un médico (y cancelar los turnos que quedan fuera de horario)
src/adelantos.ts       reglas de la lista de espera (a quién se le ofrece cada horario)
src/contrasenas.ts     cifrado de contraseñas (nunca se guardan tal cual)
src/validaciones.ts    funciones chicas para validar lo que llega en los pedidos
src/prisma.ts          el cliente de Prisma, compartido por todas las rutas
src/initDb.ts          carga los datos de ejemplo (npm run db:init)
```

## Usuarios de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Paciente | `valentin@test.com` | `p` |
| Médica (Dra. Fernández) | `m@t.com` | `m` |
| Médico (Dr. Paz) | `paz@t.com` | `m` |
| Secretaría | `norma.aguilar@consultoriosrivadavia.com` | `s` |
