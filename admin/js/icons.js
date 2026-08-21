/**
 * Íconos SVG "estilo lucide", dibujados a mano para no depender de ningún
 * paquete de npm. Uso: Icon("home", { size: 20, className: "text-teal-400" })
 * devuelve una cadena HTML con un <svg>.
 */
(function () {
  const PATHS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
    "credit-card": '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M16 2.5v4M8 2.5v4M3 9.5h18"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 6 2 6.5H4c.5-.5 2-2 2-6.5Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    "arrow-left": '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    "check-circle-2": '<circle cx="12" cy="12" r="9.5"/><path d="m8.5 12.3 2.5 2.5 5-5.2"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="M3 3l18 18"/><path d="M10.6 5.7A9.7 9.7 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a15.4 15.4 0 0 1-4 4.6M6.2 6.9C3.6 8.8 2 12 2 12s3.6 6.5 10 6.5a10 10 0 0 0 3.6-.67"/><path d="M9.5 9.6a3 3 0 0 0 4.2 4.2"/>',
    "refresh-cw": '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M3 8V3m0 5h5M21 16v5m0-5h-5"/>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/>',
    "help-circle": '<circle cx="12" cy="12" r="9.5"/><path d="M9.2 9a2.8 2.8 0 1 1 3.9 2.6c-.9.4-1.4 1-1.4 2"/><path d="M12 17h.01"/>',
    "file-text": '<path d="M7 2.5h7l4 4V21a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M14 2.5V7h4"/><path d="M8.5 12.5h7M8.5 16h7M8.5 9h3"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-4"/><path d="M15.5 13.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/><path d="M13 13.5h6.5a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H13"/>',
    "trending-up": '<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
    clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5.5l4 2.3"/>',
    info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5h.01"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6 6 2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><path d="M12 8.5 13.2 12l3.3 1.2-3.3 1.2L12 17.7l-1.2-3.3-3.3-1.2 3.3-1.2Z"/>',
  };

  function Icon(name, opts) {
    opts = opts || {};
    const size = opts.size || 18;
    const cls = opts.className ? ` ${opts.className}` : "";
    const fillCircle = opts.fill === "currentColor";
    const body = PATHS[name] || "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
      `fill="${fillCircle ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round" class="icon${cls}">${body}</svg>`
    );
  }

  window.Icon = Icon;
})();
