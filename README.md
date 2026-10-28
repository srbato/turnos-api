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

3. Levantar el servidor en modo desarrollo:

   ```
   npm run dev
   ```

4. Probar que responde: abrir http://localhost:3000/api/health. Tiene que devolver `{ "ok": true }`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Levanta la API y la reinicia sola al guardar cambios |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Levanta la versión compilada |
| `npm run prisma:generate` | Regenera el cliente de Prisma después de cambiar `prisma/schema.prisma` |
