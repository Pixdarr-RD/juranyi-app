/**
 * Configuración de la app de clientes.
 * Debe apuntar al Worker de Cloudflare (mismo backend que usa el admin).
 *
 * En local (wrangler dev): http://localhost:8787/api
 * En producción, después de `npx wrangler deploy`, reemplaza esta URL
 * con la que te dé Cloudflare, ej:
 *   https://juranyi-backend.tu-subdominio.workers.dev/api
 */
window.JURANYI_CONFIG = {
  apiUrl: "https://juranyi-backend.darwin-c90.workers.dev/api",
};
