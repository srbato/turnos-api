import { PrismaClient } from "@prisma/client";

// Un solo cliente de Prisma para toda la API: lo importan todas las rutas.
export const prisma = new PrismaClient();
