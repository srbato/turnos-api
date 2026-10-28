// dotenv carga las variables definidas en .env (DATABASE_URL y PORT).
import "dotenv/config";

// Dependencias externas: servidor HTTP y CORS.
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";

// Rutas de cada recurso (cada archivo de src/rutas agrupa las de un recurso).
import { rutasConsultorios } from "./rutas/consultorios";
import { rutasLogin } from "./rutas/login";
import { rutasMedicos } from "./rutas/medicos";
import { rutasPacientes } from "./rutas/pacientes";
import { rutasSecretarias } from "./rutas/secretarias";
import { rutasTurnos } from "./rutas/turnos";

// -----------------------------------------------------------------------------
// 1. Configuracion inicial
// -----------------------------------------------------------------------------

const app = express();
const port = Number(process.env.PORT ?? 3000);

// CORS permite que la app de Expo se conecte a la API desde otro origen.
// express.json() transforma el body JSON en req.body. El límite se sube a 5 MB porque las fotos de perfil viajan
// dentro del JSON (el límite que trae Express es de 100 KB, y una foto lo supera).
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// -----------------------------------------------------------------------------
// 2. Rutas de la API REST
// -----------------------------------------------------------------------------

// GET /api/health
// Ruta de prueba: confirma que Express esta encendido.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Todas las rutas de los recursos empiezan con /api.
app.use("/api", rutasLogin); // POST /api/login
app.use("/api", rutasConsultorios); // /api/consultorios y /api/coberturas
app.use("/api", rutasPacientes); // /api/pacientes
app.use("/api", rutasMedicos); // /api/medicos
app.use("/api", rutasSecretarias); // /api/secretarias
app.use("/api", rutasTurnos); // /api/turnos

// -----------------------------------------------------------------------------
// 3. Errores
// -----------------------------------------------------------------------------

// Cualquier ruta que no exista responde 404 en JSON (y no una página HTML).
app.use((_req, res) => {
  res.status(404).json({ error: "Esa ruta no existe" });
});

// Si una ruta falla por algo que no previmos (por ejemplo, la base no responde), Express 5 llega acá solo.
// Se responde un 500 en JSON: un error honesto es mejor que dejar al cliente esperando.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Error inesperado" });
});

// -----------------------------------------------------------------------------
// 4. Arranque del servidor
// -----------------------------------------------------------------------------

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
