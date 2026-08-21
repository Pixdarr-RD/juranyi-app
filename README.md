# Juranyi — App web de préstamos

Aplicación web completa (frontend + backend) para simular, solicitar y dar
seguimiento a préstamos personales. Dos partes independientes que se
despliegan por separado:

```
juranyi-app/
├── backend/     API REST (Node.js + Express + SQLite + JWT)
└── frontend/    App web (React + Vite + Tailwind)
```

El frontend nunca guarda contraseñas ni datos sensibles: todo vive en el
backend, en una base de datos SQLite real (`juranyi.db`), y la comunicación
entre ambos se hace por HTTP con tokens JWT.

---

## 1. Desarrollo local

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edita .env: cambia JWT_SECRET por una clave larga y aleatoria
npm start
```

Queda corriendo en `http://localhost:4000`. Prueba que funciona:
`curl http://localhost:4000/api/health`

### Frontend

En otra terminal:

```bash
cd frontend
npm install
cp .env.example .env
# VITE_API_URL=http://localhost:4000/api  (ya viene así por defecto)
npm run dev
```

Abre `http://localhost:5173`. El frontend hace todas sus peticiones a la
URL definida en `VITE_API_URL`.

---

## 2. Desplegar como app web (Render)

La forma más rápida es con el **Blueprint** incluido (`render.yaml`), que
crea los dos servicios de una vez:

1. Sube esta carpeta a un repositorio de GitHub/GitLab.
2. En Render: **New +** → **Blueprint** → selecciona el repo.
3. Render detecta `render.yaml` y crea:
   - `juranyi-backend`: servicio web Node con disco persistente en `/data`
     (para que la base de datos SQLite no se borre en cada deploy).
   - `juranyi-frontend`: sitio estático (build de Vite).
4. Cuando ambos estén desplegados, Render te da sus URLs reales, por ejemplo:
   - `https://juranyi-backend.onrender.com`
   - `https://juranyi-frontend.onrender.com`
5. Ajusta las variables de entorno si los nombres finales cambiaron
   (Render añade un sufijo si el nombre ya está tomado):
   - En **juranyi-backend** → `CORS_ORIGIN` = URL real del frontend.
   - En **juranyi-frontend** → `VITE_API_URL` = URL real del backend + `/api`.
   - Guarda y vuelve a desplegar (**Manual Deploy**) el que hayas editado.

### Sin Blueprint (manual)

**Backend** → New + → Web Service → conecta el repo:
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variables: `JWT_SECRET`, `CORS_ORIGIN`, opcional `DB_PATH=/data/juranyi.db`
- Si agregas un Persistent Disk, móntalo en `/data`.

**Frontend** → New + → Static Site → conecta el repo:
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment Variables: `VITE_API_URL=https://<tu-backend>.onrender.com/api`

---

## 3. Desplegar en Railway

Railway no usa `render.yaml`, así que se crean dos servicios manualmente
dentro del mismo proyecto:

**Backend**
1. New Project → Deploy from GitHub repo.
2. En el servicio, Settings → Root Directory: `backend`.
3. Variables: `JWT_SECRET`, `CORS_ORIGIN` (la URL del frontend), `PORT` (Railway
   la inyecta solo, no hace falta fijarla).
4. Si quieres persistencia real entre deploys, añade un Volume montado en
   `/data` y define `DB_PATH=/data/juranyi.db`.
5. Railway te da una URL pública tipo `https://juranyi-backend-production.up.railway.app`.

**Frontend**
1. En el mismo proyecto, New Service → Deploy from GitHub repo (mismo repo).
2. Settings → Root Directory: `frontend`.
3. Variables: `VITE_API_URL=https://<tu-backend>.up.railway.app/api`.
4. Build Command: `npm install && npm run build` — Start Command: `npm run preview`
   (o activa "Static" en Railway y sirve la carpeta `dist`).
5. Vuelve al servicio del backend y actualiza `CORS_ORIGIN` con la URL final
   del frontend.

---

## 4. Notas importantes

- **JWT_SECRET**: nunca uses el valor de ejemplo en producción. En Render,
  el blueprint lo genera solo (`generateValue: true`); en Railway, escribe
  uno tú mismo (cadena larga y aleatoria).
- **Persistencia de datos**: SQLite guarda todo en un archivo. Sin un disco
  persistente montado, los datos se pierden en cada redeploy — por eso el
  blueprint de Render incluye un disco en `/data`.
- **CORS**: `CORS_ORIGIN` en el backend debe coincidir exactamente con la
  URL pública del frontend (sin `/` al final). Puedes poner varias
  separadas por coma si tienes preview + producción.
- **Diseño responsive**: el frontend ya no está encerrado en un marco de
  celular — en pantallas pequeñas ocupa todo el ancho como cualquier sitio
  web, y en escritorio se centra en una tarjeta de ancho fijo (el mismo
  patrón que usan apps web como WhatsApp Web o bancos móviles-web).
- Todas las contraseñas se guardan con `bcrypt`; nunca en texto plano.
