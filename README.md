# Sistema de Asistencia por QR — Guía paso a paso

## 1. Por qué no te funcionaba antes

Tu archivo original usaba `window.storage`, una función que **solo existe dentro de Claude.ai**.
Fuera de ahí no existe, por eso:
- El botón se quedaba en "Registrando..." y nunca terminaba.
- Aunque terminara, cada celular tendría su propia base de datos aislada (no se verían entre sí).

La solución es tener un **servidor** (Node.js) que guarda los datos en un solo lugar, y que
tanto el alumno como el docente consultan a través de internet.

## 2. Estructura del proyecto (apartados)

```
asistencia-qr/
├── server.js              ← EL SERVIDOR: aquí vive la "base de datos" y las reglas
├── package.json            ← Lista de librerías que necesita el proyecto
├── data/
│   └── asistencia.json     ← LA BASE DE DATOS (se llena sola, no la edites a mano)
└── public/
    ├── index.html           ← APARTADO USUARIO: solo registra, no ve nada más
    └── admin.html            ← APARTADO ADMINISTRADOR: pide clave, ve/borra/descarga
```

- **Usuario (alumno):** entra a `index.html` (la raíz del sitio `/`). Solo puede escribir
  su nombre y presionar "Registrar entrada". No hay ningún enlace ni botón hacia los
  registros — no tiene forma de ver la base de datos.
- **Administrador (docente):** entra a `/admin`, escribe la clave, y ahí ve la tabla de
  registros, el QR para compartir, y los botones de actualizar / descargar Excel / borrar.

La clave de docente está definida en `server.js`:
```js
const ADMIN_KEY = process.env.ADMIN_KEY || 'docente2026';
```
Cámbiala por la que tú quieras usar.

## 3. Abrir el proyecto en VS Code

1. Descarga/copia la carpeta `asistencia-qr` completa a tu computadora.
2. Abre VS Code → `Archivo > Abrir carpeta...` → selecciona `asistencia-qr`.
3. Instala Node.js si no lo tienes: https://nodejs.org (versión LTS). Verifica en la
   terminal de VS Code (`Ctrl + ñ` o `Terminal > Nueva terminal`):
   ```
   node -v
   npm -v
   ```

## 4. Instalar dependencias y correr el servidor

En la terminal de VS Code, dentro de la carpeta del proyecto:

```bash
npm install
npm start
```

Verás en la terminal:
```
Servidor corriendo en http://localhost:3000
Panel docente en http://localhost:3000/admin
```

Abre esas dos URLs en el navegador para probar:
- `http://localhost:3000` → formulario del alumno
- `http://localhost:3000/admin` → panel del docente (clave: `docente2026`)

Registra un nombre de prueba en la primera y dale "Actualizar" en el panel: debe aparecer
inmediatamente. Eso confirma que el flujo funciona de extremo a extremo.

## 5. Generar el QR (paso a paso)

El QR simplemente es una imagen que apunta a la URL pública de tu formulario (`/`).
Tienes dos formas:

### Opción A — El QR ya se genera solo (recomendado)
Dentro de `admin.html` ya hay código que genera el QR automáticamente usando el servicio
gratuito `api.qrserver.com`, apuntando siempre a la URL donde esté publicada tu página.
No tienes que hacer nada: al entrar a `/admin` verás el QR listo para imprimir o compartir
en pantalla.

### Opción B — Generarlo manualmente en una página web
Si prefieres un QR aparte (para imprimir en un cartel, por ejemplo):
1. Ve a https://www.qr-code-generator.com o https://www.qrcode-monkey.com
2. Pega la URL pública de tu formulario (ej. `https://tu-app.onrender.com/`)
3. Genera y descarga la imagen PNG.
4. Si quieres mostrarla dentro del proyecto, guárdala en `public/qr.png` y en `admin.html`
   reemplaza la línea del `img.src` por: `img.src = 'qr.png';`

⚠️ Importante: el QR **no funcionará desde el celular de un alumno** si apunta a
`localhost:3000`, porque `localhost` solo existe dentro de tu propia computadora. Necesitas
publicar el proyecto (siguiente paso) para tener una URL pública real.

## 6. Publicar el proyecto para que el QR funcione desde cualquier celular

Necesitas un hosting que corra Node.js (no sirve GitHub Pages, porque ese solo sirve
archivos estáticos). Opciones gratuitas sencillas:

**Render.com (recomendado para empezar):**
1. Sube tu carpeta a un repositorio en GitHub.
2. Entra a https://render.com → "New +" → "Web Service" → conecta tu repositorio.
3. Configuración:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Espera a que despliegue. Te dará una URL como `https://asistencia-qr.onrender.com`.
5. Esa es la URL que debe llevar tu QR — ya se genera sola en `/admin` porque el código
   usa `window.location.origin` (la URL real donde está corriendo, sea cual sea).

**Railway.app** funciona de forma muy parecida si prefieres esa alternativa.

## 7. Resumen de los errores que reportaste, ya corregidos

| Problema que tenías | Causa | Solución aplicada |
|---|---|---|
| El botón se queda en "Registrando..." | `window.storage` no existe fuera de Claude.ai | Ahora `index.html` hace `fetch('/api/registrar')` a un servidor real |
| No llega a la base de datos del Panel docente | No había una base de datos compartida entre dispositivos | `server.js` guarda todo en `data/asistencia.json`, un solo lugar que todos consultan |
| No se actualiza el nombre registrado | El panel leía de un storage que nunca se llenó | `admin.html` hace `fetch('/api/registros')` cada vez que refrescas o cada 8 segundos |

## 8. Próximos pasos opcionales

- Si tendrás muchos registros por mucho tiempo, se puede migrar `data/asistencia.json` a
  una base de datos real como SQLite o PostgreSQL — avísame y te ayudo a hacer el cambio.
- Si quieres registrar también la **salida** (no solo la entrada), puedo agregar un
  segundo botón y una columna "Hora de salida".
