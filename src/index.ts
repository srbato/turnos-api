// dotenv carga las variables definidas en .env (DATABASE_URL y PORT).
import "dotenv/config";

// Dependencias externas: servidor HTTP y CORS.
import cors from "cors";
import express from "express";

// -----------------------------------------------------------------------------
// 1. Configuracion inicial
// -----------------------------------------------------------------------------

const app = express();
const port = Number(process.env.PORT ?? 3000);

// CORS permite que la app de Expo se conecte a la API desde otro origen.
// express.json() transforma el body JSON en req.body.
app.use(cors());
app.use(express.json());

// -----------------------------------------------------------------------------
// 2. Rutas de la API REST
// -----------------------------------------------------------------------------

// GET /api/health
// Ruta de prueba: confirma que Express esta encendido.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// -----------------------------------------------------------------------------
// 3. Arranque del servidor
// -----------------------------------------------------------------------------

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
