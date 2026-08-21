# Juranyi — App de clientes + Panel del dueño + Backend en Cloudflare

Este paquete trae **tres piezas**:

```
juranyi/
├── worker/      ← backend (Cloudflare Worker + base de datos D1)
├── frontend/    ← la app que usan tus clientes (deudores)
└── admin/       ← el panel donde TÚ administras el negocio
```

El backend ya **no corre en tu computadora** (antes era `node server.js`
con todo guardado en `db.json`). Ahora vive en la red de Cloudflare como
un **Worker**, y los datos se guardan en **D1**, la base de datos SQL de
Cloudflare. Esto significa que no depende de que tengas tu máquina
prendida, y ya no hay que preocuparse por "discos persistentes" al
desplegar — D1 persiste sola.

## 0. Antes de empezar

Necesitas:
- Una cuenta gratis de Cloudflare: https://dash.cloudflare.com/sign-up
- [Node.js](https://nodejs.org) instalado en tu computadora (solo para
  correr los comandos de despliegue, `npm install` no hace falta para
  el resto).

Todo lo que sigue usa **Wrangler**, la herramienta de línea de comandos
de Cloudflare. No necesitas instalarla globalmente — `npx wrangler`
la descarga sola la primera vez que la usas.

## 1. Crear la base de datos D1

```bash
cd worker
npx wrangler login          # abre el navegador para conectar tu cuenta
npx wrangler d1 create juranyi-db
```

Esto imprime algo como:

```
[[d1_databases]]
binding = "DB"
database_name = "juranyi-db"
database_id = "1a2b3c4d-....-....-............"
```

Copia ese `database_id` y pégalo en `worker/wrangler.toml`, reemplazando
`PON-AQUI-EL-DATABASE-ID-QUE-TE-DIO-WRANGLER`.

## 2. Cargar el esquema (crear las tablas)

```bash
npx wrangler d1 execute juranyi-db --remote --file=./schema.sql
```

Esto crea las tablas (deudores, préstamos, pagos, notificaciones,
sesiones, administradores) y siembra el admin por defecto:
- Correo: `admin@juranyi.com`
- Clave: `admin123`

⚠️ **Cambia esa contraseña apenas puedas** (ver sección de seguridad).

## 3. Desplegar el Worker (el backend)

```bash
npx wrangler deploy
```

Te va a dar una URL pública, algo como:

```
https://juranyi-backend.tu-subdominio.workers.dev
```

Esa es la URL de tu backend. Guárdala, la necesitas en el siguiente paso.

## 4. Conectar el frontend y el admin a esa URL

Edita estos dos archivos y reemplaza la URL de ejemplo con la tuya
(agregando `/api` al final):

- `frontend/js/config.js` → `window.JURANYI_CONFIG.apiUrl`
- `admin/js/admin-config.js` → `window.JURANYI_ADMIN_CONFIG.apiUrl`

```js
window.JURANYI_CONFIG = {
  apiUrl: "https://juranyi-backend.tu-subdominio.workers.dev/api",
};
```

## 5. Abrir la app de clientes (local, para probar)

```bash
cd frontend
python3 -m http.server 5173
```

Abre `http://localhost:5173`.

## 6. Abrir el panel del dueño (local, para probar)

```bash
cd admin
python3 -m http.server 5174
```

Abre `http://localhost:5174` e inicia sesión con `admin@juranyi.com` /
`admin123`.

## Desplegar frontend y admin en internet

El Worker (backend) ya está en internet desde el paso 3. Para que tus
clientes usen la app desde sus celulares, sube `frontend/` y `admin/` a
cualquier hosting estático: Netlify, Vercel, GitHub Pages, o el propio
**Cloudflare Pages** (ya que estás en Cloudflare, es la opción más simple:
`npx wrangler pages deploy frontend` y `npx wrangler pages deploy admin`
desde sus respectivas carpetas). Idealmente sube el admin a una
dirección distinta a la de tus clientes (por ejemplo
`admin.tudominio.com`), para que no sea obvio para el público.

## Desarrollo local del backend (sin desplegar)

```bash
cd worker
npx wrangler d1 execute juranyi-db --local --file=./schema.sql   # una sola vez
npx wrangler dev
```

Esto levanta el Worker en `http://localhost:8787` usando una copia local
de D1 (no toca tus datos reales en producción). Apunta temporalmente
`apiUrl` a `http://localhost:8787/api` para probar cambios antes de
desplegar.

## Seguridad — hazlo antes de usar esto con datos reales

- **Cambia la contraseña del admin.** Ahora mismo es `admin123`, solo
  para que puedas entrar la primera vez. Dime y te agrego un endpoint
  para cambiarla desde el panel, o te doy el comando SQL exacto para
  generarla y actualizarla en D1.
- Cloudflare sirve todo el Worker por **HTTPS automáticamente** — no hay
  nada que configurar ahí.
- Los datos ahora están en D1 (SQL), no en un archivo de texto plano —
  Cloudflare hace respaldos de la infraestructura, pero igual es buena
  idea exportar la base de vez en cuando:
  `npx wrangler d1 export juranyi-db --remote --output=respaldo.sql`
- Los tokens de sesión duran 7 días. Si un admin deja de trabajar
  contigo, bórralo de la tabla `admins` en D1 o dime y agrego un
  endpoint para desactivar admins.

## ¿Qué endpoints tiene el backend?

Los mismos de siempre — la migración a Cloudflare no cambió ninguna ruta
ni ningún formato de respuesta, así que si alguna vez agregaste código
personalizado contra esta API, sigue funcionando igual.

**Clientes** (usa el token del deudor):
`POST /api/auth/register`, `POST /api/auth/login`, `GET /api/applications`,
`GET /api/applications/history`, `GET /api/notifications`,
`POST /api/applications`, `POST /api/applications/:id/advance`,
`POST /api/applications/:id/payments/:num/pay`,
`POST /api/notifications/read-all`.

**Administrador** (usa el token del admin):
`POST /api/admin/login`, `GET /api/admin/stats`, `GET /api/admin/users`,
`GET /api/admin/users/:id`, `PATCH /api/admin/users/:id`,
`GET /api/admin/applications`, `POST /api/admin/applications/:id/approve`,
`POST /api/admin/applications/:id/reject`,
`PATCH /api/admin/applications/:id`,
`POST /api/admin/applications/:id/payments/:num/mark-paid`,
`POST /api/admin/applications/:id/payments/:num/mark-late`,
`GET /api/admin/applications/:id/receipt/:num`.

## ¿Qué cambió técnicamente respecto a la versión con Node.js?

- El servidor HTTP de Node (`http.createServer`) se reemplazó por un
  Cloudflare Worker (`worker/src/index.js`), que responde al mismo
  contrato de rutas.
- `db.json` se reemplazó por tablas D1 (`worker/schema.sql` +
  `worker/src/db.js`), que es SQL real con índices, en vez de un archivo
  reescrito completo en cada cambio.
- El hash de contraseñas pasó de `crypto.scryptSync` (solo disponible en
  Node) a PBKDF2-SHA256 vía Web Crypto (`worker/src/utils.js`), que sí
  está disponible en el runtime de Cloudflare Workers. Las contraseñas
  existentes en un `db.json` viejo **no son compatibles** — si vienes de
  la versión anterior, los usuarios tendrán que registrarse de nuevo (o
  dime y te ayudo a migrar los hashes).
