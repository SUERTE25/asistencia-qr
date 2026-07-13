// ============================================================
// SERVIDOR — Sistema de Asistencia por QR
// Aquí vive la "base de datos" y las reglas de quién puede
// leer/escribir. El usuario (alumno) solo puede REGISTRAR.
// El docente (admin) es el único que puede VER y BORRAR.
// ============================================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'asistencia.json');
const QR_FILE = path.join(__dirname, 'data', 'qrtoken.json');

// ⚠️ Cambia esta clave por la que tú quieras usar como docente.
// Es la "contraseña" para entrar al panel y ver los registros.
const ADMIN_KEY = process.env.ADMIN_KEY || 'docente2026';

// Zona horaria fija para que el servidor registre la hora real de Ecuador
// sin importar en qué país esté físicamente el servidor (Render usa UTC).
const TIMEZONE = 'America/Guayaquil';

// El QR se renueva automáticamente después de este tiempo (7 días).
const QR_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Utilidades de la base de datos (archivo JSON) ----------
function asegurarArchivo() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}
asegurarArchivo();

function leerRegistros() {
  asegurarArchivo();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}
function guardarRegistros(registros) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(registros, null, 2), 'utf8');
}
function claveValida(req) {
  const key = req.query.admin_key || req.headers['x-admin-key'];
  return key === ADMIN_KEY;
}
function hoyISO() {
  return new Date().toLocaleDateString('es-EC', { timeZone: TIMEZONE });
}
function horaActual(now) {
  return now.toLocaleTimeString('es-EC', { hour12: false, timeZone: TIMEZONE });
}

// ---------- Token del QR (rotación semanal) ----------
function generarToken() {
  return crypto.randomBytes(6).toString('hex');
}
function leerTokenQr() {
  if (!fs.existsSync(QR_FILE)) {
    const nuevo = { token: generarToken(), createdAt: Date.now() };
    fs.writeFileSync(QR_FILE, JSON.stringify(nuevo, null, 2), 'utf8');
    return nuevo;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(QR_FILE, 'utf8'));
  } catch (e) {
    data = { token: generarToken(), createdAt: Date.now() };
  }
  // Si ya pasó una semana, se genera uno nuevo automáticamente
  if (Date.now() - data.createdAt > QR_LIFETIME_MS) {
    data = { token: generarToken(), createdAt: Date.now() };
    fs.writeFileSync(QR_FILE, JSON.stringify(data, null, 2), 'utf8');
  }
  return data;
}
function regenerarTokenQr() {
  const nuevo = { token: generarToken(), createdAt: Date.now() };
  fs.writeFileSync(QR_FILE, JSON.stringify(nuevo, null, 2), 'utf8');
  return nuevo;
}

// ---------- Rutas de páginas ----------

// Página pública del ALUMNO (la que abre el QR)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Panel del DOCENTE (pide clave)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------- API: Registrar asistencia (público, sin clave) ----------
app.post('/api/registrar', (req, res) => {
  const name = (req.body.name || '').trim();
  const tokenRecibido = (req.body.token || '').trim();

  if (!name) {
    return res.status(400).json({ ok: false, error: 'Escribe tu nombre completo.' });
  }

  // Verifica que el QR escaneado sea el vigente (evita fotos de QR viejos)
  const tokenVigente = leerTokenQr();
  if (!tokenRecibido || tokenRecibido !== tokenVigente.token) {
    return res.status(400).json({
      ok: false,
      expirado: true,
      error: 'Este código QR ya no es válido. Pide a tu docente el código actualizado.'
    });
  }

  const registros = leerRegistros();
  const now = new Date();
  const fecha = hoyISO();
  const normalizado = name.toLowerCase();

  const yaExiste = registros.find(
    r => r.name.toLowerCase() === normalizado && r.date === fecha
  );
  if (yaExiste) {
    return res.json({ ok: true, duplicado: true, record: yaExiste });
  }

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name,
    date: fecha,
    time: horaActual(now),
    ts: now.getTime()
  };

  registros.push(record);
  guardarRegistros(registros);
  res.json({ ok: true, duplicado: false, record });
});

// ---------- API: Info del QR vigente (público) ----------
app.get('/api/qr-info', (req, res) => {
  const info = leerTokenQr();
  res.json({
    ok: true,
    token: info.token,
    createdAt: info.createdAt,
    expiresAt: info.createdAt + QR_LIFETIME_MS
  });
});

// ---------- API: Regenerar QR manualmente (solo docente) ----------
app.post('/api/qr-info/regenerar', (req, res) => {
  if (!claveValida(req)) {
    return res.status(401).json({ ok: false, error: 'Clave de docente incorrecta.' });
  }
  const info = regenerarTokenQr();
  res.json({
    ok: true,
    token: info.token,
    createdAt: info.createdAt,
    expiresAt: info.createdAt + QR_LIFETIME_MS
  });
});

// ---------- API: Ver registros (solo docente, requiere clave) ----------
app.get('/api/registros', (req, res) => {
  if (!claveValida(req)) {
    return res.status(401).json({ ok: false, error: 'Clave de docente incorrecta.' });
  }
  const registros = leerRegistros().sort((a, b) => b.ts - a.ts);
  res.json({ ok: true, registros });
});

// ---------- API: Borrar todo (solo docente) ----------
app.delete('/api/registros', (req, res) => {
  if (!claveValida(req)) {
    return res.status(401).json({ ok: false, error: 'Clave de docente incorrecta.' });
  }
  guardarRegistros([]);
  res.json({ ok: true });
});

// ---------- API: Descargar Excel (solo docente) ----------
app.get('/api/registros/excel', (req, res) => {
  if (!claveValida(req)) {
    return res.status(401).send('Clave de docente incorrecta.');
  }
  const registros = leerRegistros().sort((a, b) => a.ts - b.ts);
  const filas = registros.map(r => ({ Nombre: r.name, Fecha: r.date, Hora: r.time }));
  const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ Nombre: '', Fecha: '', Hora: '' }]);
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="asistencia.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Panel docente en http://localhost:${PORT}/admin`);
});
