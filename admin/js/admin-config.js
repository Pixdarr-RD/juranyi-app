/**
 * Configuración del panel de administrador de Juranyi.
 * Debe apuntar al MISMO Worker de Cloudflare que usa la app de clientes.
 *
 * En local (wrangler dev): http://localhost:8787/api
 * En producción, después de `npx wrangler deploy`, reemplaza esta URL
 * con la que te dé Cloudflare, ej:
 *   https://juranyi-backend.tu-subdominio.workers.dev/api
 */
window.JURANYI_ADMIN_CONFIG = {
  apiUrl: "https://juranyi-backend.TU-SUBDOMINIO.workers.dev/api",
};
