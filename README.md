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

## Usuarios de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Paciente | `valentin@test.com` | `p` |
| Médica (Dra. Fernández) | `m@t.com` | `m` |
| Médico (Dr. Paz) | `paz@t.com` | `m` |
| Secretaría | `norma.aguilar@consultoriosrivadavia.com` | `s` |
