/* ======================================================================
   Juranyi Admin — Panel del dueño (HTML + CSS + JS puro)
   ====================================================================== */

(function () {
  "use strict";

  const API_URL = (window.JURANYI_ADMIN_CONFIG && window.JURANYI_ADMIN_CONFIG.apiUrl) || "http://localhost:4000/api";

  async function api(path, opts) {
    opts = opts || {};
    let res;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method: opts.method || "GET",
        headers: Object.assign(
          { "Content-Type": "application/json" },
          state.token ? { Authorization: `Bearer ${state.token}` } : {}
        ),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new Error("No se pudo conectar al backend. Verifica que esté corriendo y la URL en admin-config.js.");
    }
    let data = {};
    try {
      data = await res.json();
    } catch (e) {}
    if (res.status === 401) {
      state.token = null;
      state.admin = null;
      localStorage.removeItem("juranyi_admin_token");
      render();
    }
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  function esc(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtMoney(n) {
    return `RD$ ${Math.round(Number(n) || 0).toLocaleString("es-DO")}`;
  }
  function Icon(name, opts) {
    return window.Icon(name, opts);
  }

  const state = {
    token: localStorage.getItem("juranyi_admin_token") || null,
    admin: null,
    view: "dashboard",
    loginError: "",
    loginBusy: false,
    globalError: "",
    stats: null,
    users: [],
    applications: [],
    selectedUserId: null,
    filterEstado: "",
    modal: null, // { type, data }
    modalError: "",
    modalBusy: false,
  };

  /* -------------------------------------------------------------- */
  /*  Data loading                                                    */
  /* -------------------------------------------------------------- */

  async function loadDashboard() {
    state.globalError = "";
    try {
      const data = await api("/admin/stats");
      state.stats = data.stats;
    } catch (e) {
      state.globalError = e.message;
    }
    render();
  }

  async function loadUsers() {
    state.globalError = "";
    try {
      const data = await api("/admin/users");
      state.users = data.users;
    } catch (e) {
      state.globalError = e.message;
    }
    render();
  }

  async function loadApplications() {
    state.globalError = "";
    try {
      const q = state.filterEstado ? `?estado=${encodeURIComponent(state.filterEstado)}` : "";
      const data = await api(`/admin/applications${q}`);
      state.applications = data.applications;
    } catch (e) {
      state.globalError = e.message;
    }
    render();
  }

  async function loadUserDetail(id) {
    state.globalError = "";
    try {
      const data = await api(`/admin/users/${id}`);
      state.selectedUser = data.user;
      state.selectedUserApps = data.applications;
    } catch (e) {
      state.globalError = e.message;
    }
    render();
  }

  function goto(view, extra) {
    state.view = view;
    state.modal = null;
    Object.assign(state, extra || {});
    render();
    if (view === "dashboard") loadDashboard();
    if (view === "deudores") loadUsers();
    if (view === "solicitudes") loadApplications();
    if (view === "deudorDetail") loadUserDetail(state.selectedUserId);
  }

  /* -------------------------------------------------------------- */
  /*  Small UI blocks                                                  */
  /* -------------------------------------------------------------- */

  function badgeForEstado(estado) {
    const map = {
      en_evaluacion: ["En evaluación", "pending"],
      activo: ["Activo", "success"],
      pagado: ["Pagado", "info"],
      rechazado: ["Rechazado", "danger"],
    };
    const [label, tone] = map[estado] || [estado, "neutral"];
    return `<span class="badge badge-${tone}">${esc(label)}</span>`;
  }

  function card(title, innerHtml) {
    return `<div class="card">${title ? `<p class="card-title">${esc(title)}</p>` : ""}${innerHtml}</div>`;
  }
  function row(label, value) {
    return `<div class="row"><span class="row-label">${esc(label)}</span><span class="row-value">${value}</span></div>`;
  }
  function field(label, innerHtml) {
    return `<label class="field"><span class="field-label">${esc(label)}</span>${innerHtml}</label>`;
  }
  function textInput(id, opts) {
    opts = opts || {};
    return `<input id="${id}" type="${opts.type || "text"}" class="text-input" value="${esc(opts.value !== undefined ? opts.value : "")}" placeholder="${esc(opts.placeholder || "")}" />`;
  }

  /* -------------------------------------------------------------- */
  /*  Login screen                                                     */
  /* -------------------------------------------------------------- */

  function screenLogin() {
    return `
      <div class="login-screen">
        <div class="login-card">
          <div style="text-align:center;margin-bottom:1.5rem;">
            <span class="logo">J</span>
            <p style="color:#fff;font-weight:700;margin-top:0.4rem;">Panel del dueño</p>
            <p style="color:var(--slate-500);font-size:0.78rem;">Inicia sesión como administrador</p>
          </div>
          <form data-form="admin-login">
            ${field("Correo", textInput("admin-correo", { placeholder: "admin@juranyi.com" }))}
            ${field("Contraseña", textInput("admin-password", { type: "password", placeholder: "••••••••" }))}
            ${state.loginError ? `<p class="form-error">${esc(state.loginError)}</p>` : ""}
            <button type="submit" class="btn btn-primary" style="width:100%;" ${state.loginBusy ? "disabled" : ""}>
              ${state.loginBusy ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Sidebar / shell                                                  */
  /* -------------------------------------------------------------- */

  function sidebar() {
    const items = [
      { key: "dashboard", label: "Resumen", icon: "trending-up" },
      { key: "deudores", label: "Deudores", icon: "user" },
      { key: "solicitudes", label: "Solicitudes y préstamos", icon: "wallet" },
    ];
    return `
      <div class="sidebar">
        <div class="sidebar-header">
          <span class="logo" style="font-size:1.4rem;">J</span>
          <div>
            <div class="sidebar-title">Juranyi Admin</div>
            <div class="sidebar-sub">${esc((state.admin && state.admin.nombre) || "")}</div>
          </div>
        </div>
        ${items
          .map(
            (it) => `
          <button type="button" class="nav-item ${state.view === it.key || (state.view === "deudorDetail" && it.key === "deudores") ? "active" : ""}" data-action="goto" data-view="${it.key}">
            ${Icon(it.icon, { size: 17 })} ${esc(it.label)}
          </button>`
          )
          .join("")}
        <div class="sidebar-footer">
          <button type="button" class="nav-item" data-action="admin-logout">
            ${Icon("log-out", { size: 17 })} Cerrar sesión
          </button>
        </div>
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Dashboard                                                        */
  /* -------------------------------------------------------------- */

  function screenDashboard() {
    const s = state.stats;
    if (!s) return `<p class="cell-muted">Cargando...</p>`;
    const stat = (label, value, cls) => `
      <div class="stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-value ${cls || ""}">${value}</div></div>`;
    return `
      <div class="stats-grid">
        ${stat("Total de deudores", s.totalDeudores)}
        ${stat("Préstamos activos", s.prestamosActivos, "teal")}
        ${stat("Solicitudes pendientes", s.solicitudesPendientes, "amber")}
        ${stat("Préstamos pagados", s.prestamosPagados)}
        ${stat("Total prestado (histórico)", fmtMoney(s.totalPrestado), "teal")}
        ${stat("Por cobrar (activos)", fmtMoney(s.totalPorCobrar))}
        ${stat("Cuotas vencidas", s.cuotasVencidas, s.cuotasVencidas > 0 ? "red" : "")}
      </div>
      <div class="btn-row" style="margin-bottom:1rem;">
        <button type="button" class="btn btn-secondary" data-action="goto" data-view="solicitudes" data-filter="en_evaluacion">Ver solicitudes pendientes</button>
        <button type="button" class="btn btn-secondary" data-action="goto" data-view="deudores">Ver deudores</button>
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Deudores (list + detail)                                        */
  /* -------------------------------------------------------------- */

  function screenDeudores() {
    const rows = state.users
      .map((u) => {
        const estadoBadge =
          u.estado === "bloqueado" ? `<span class="badge badge-danger">Bloqueado</span>` : `<span class="badge badge-success">Activo</span>`;
        let situacion = `<span class="cell-muted">Sin préstamos</span>`;
        if (u.prestamoActivo) situacion = `<span class="badge badge-success">Préstamo activo · ${fmtMoney(u.prestamoActivo.monto)}</span>`;
        else if (u.solicitudPendiente) situacion = `<span class="badge badge-pending">Solicitud pendiente · ${fmtMoney(u.solicitudPendiente.monto)}</span>`;
        return `
        <tr class="clickable-row" data-action="goto" data-view="deudorDetail" data-user-id="${esc(u.id)}" style="cursor:pointer;">
          <td class="cell-strong">${esc(u.nombres)}</td>
          <td class="cell-muted">${esc(u.cedula)}</td>
          <td class="cell-muted">${esc(u.correo)}<br><span style="font-size:0.72rem;">${esc(u.telefono || "")}</span></td>
          <td>${situacion}</td>
          <td>${estadoBadge}</td>
        </tr>`;
      })
      .join("");

    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Cédula</th><th>Contacto</th><th>Situación</th><th>Estado</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="table-empty">Todavía no hay deudores registrados.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function screenDeudorDetail() {
    const u = state.selectedUser;
    if (!u) return `<p class="cell-muted">Cargando...</p>`;
    const apps = state.selectedUserApps || [];

    const infoCard = card(
      "Datos personales",
      `
      ${row("Nombres", esc(u.nombres))}
      ${row("Cédula", esc(u.cedula))}
      ${row("Teléfono", esc(u.telefono || "—"))}
      ${row("Correo", esc(u.correo))}
      ${row("Dirección", esc(u.direccion || "—"))}
      ${row("Estado civil", esc(u.estadoCivil || "—"))}
      ${row("Cuenta", u.estado === "bloqueado" ? `<span class="badge badge-danger">Bloqueada</span>` : `<span class="badge badge-success">Activa</span>`)}
      <div class="btn-row" style="margin-top:0.9rem;">
        ${`<button type="button" class="btn btn-secondary btn-sm" data-action="open-edit-user">${Icon("user", { size: 14 })} Editar datos</button>`}
        ${
          u.estado === "bloqueado"
            ? `<button type="button" class="btn btn-secondary btn-sm" data-action="toggle-block-user" data-block="0">Reactivar cuenta</button>`
            : `<button type="button" class="btn btn-danger btn-sm" data-action="toggle-block-user" data-block="1">Bloquear cuenta</button>`
        }
      </div>`
    );

    const appsHtml = apps.length
      ? apps.map((a) => loanCard(a, u)).join("")
      : `<p class="cell-muted">Este deudor todavía no tiene solicitudes.</p>`;

    return `
      <button type="button" class="back-link" data-action="goto" data-view="deudores">${Icon("arrow-left", { size: 15 })} Volver a deudores</button>
      ${infoCard}
      <p class="card-title" style="margin:1.25rem 0 0.75rem;">Solicitudes y préstamos</p>
      ${appsHtml}`;
  }

  function loanCard(a, deudor) {
    const pagados = (a.pagos || []).filter((p) => p.estado === "Pagado").length;
    const totalPagos = (a.pagos || []).length;
    const actions = [];
    if (a.estado === "en_evaluacion") {
      actions.push(`<button type="button" class="btn btn-primary btn-sm" data-action="approve-app" data-app-id="${esc(a.id)}">Aprobar</button>`);
      actions.push(`<button type="button" class="btn btn-danger btn-sm" data-action="open-reject" data-app-id="${esc(a.id)}">Rechazar</button>`);
    }
    if (a.estado === "en_evaluacion" || a.estado === "activo") {
      actions.push(`<button type="button" class="btn btn-secondary btn-sm" data-action="open-edit-loan" data-app-id="${esc(a.id)}">Editar condiciones</button>`);
    }

    const pagosHtml =
      a.estado === "activo" && totalPagos
        ? `<div class="divider"></div><p class="row-label" style="margin-bottom:0.4rem;">Cuotas (${pagados}/${totalPagos} pagadas)</p>` +
          a.pagos
            .map(
              (p) => `
          <div class="pay-mini-row">
            <span>#${p.num} · ${esc(p.fecha)} · ${fmtMoney(p.cuota)}</span>
            <span class="btn-row">
              ${
                p.estado === "Pagado"
                  ? `<span class="badge badge-success">Pagada</span><button type="button" class="link-btn" data-action="print-receipt" data-app-id="${esc(a.id)}" data-num="${p.num}">Imprimir recibo</button>`
                  : `<span class="badge ${p.estado === "Atrasado" ? "badge-danger" : "badge-pending"}">${esc(p.estado)}</span>
                     <button type="button" class="btn btn-secondary btn-sm" data-action="mark-paid" data-app-id="${esc(a.id)}" data-num="${p.num}">Marcar pagada</button>
                     ${p.estado !== "Atrasado" ? `<button type="button" class="btn btn-danger btn-sm" data-action="mark-late" data-app-id="${esc(a.id)}" data-num="${p.num}">Marcar atrasada</button>` : ""}`
              }
            </span>
          </div>`
            )
            .join("")
        : "";

    return `
      <div class="card">
        <div class="row" style="margin-bottom:0.25rem;">
          <span class="row-label">#${esc(a.id)} · ${esc(a.fechaSolicitud)}</span>
          ${badgeForEstado(a.estado)}
        </div>
        ${row("Monto", fmtMoney(a.monto))}
        ${row("Plazo", `${a.meses} meses · ${a.tasa}% anual`)}
        ${row("Cuota mensual", fmtMoney(a.cuota))}
        ${row("Total a pagar", fmtMoney(a.total))}
        ${a.estado === "rechazado" ? row("Motivo de rechazo", esc(a.motivoRechazo || "—")) : ""}
        ${pagosHtml}
        ${actions.length ? `<div class="btn-row" style="margin-top:0.9rem;">${actions.join("")}</div>` : ""}
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Solicitudes y préstamos (todas las applications)                 */
  /* -------------------------------------------------------------- */

  function screenSolicitudes() {
    const filters = [
      { key: "", label: "Todas" },
      { key: "en_evaluacion", label: "En evaluación" },
      { key: "activo", label: "Activas" },
      { key: "pagado", label: "Pagadas" },
      { key: "rechazado", label: "Rechazadas" },
    ];
    const rows = state.applications
      .map((a) => {
        const actions = [];
        if (a.estado === "en_evaluacion") {
          actions.push(`<button type="button" class="btn btn-primary btn-sm" data-action="approve-app" data-app-id="${esc(a.id)}">Aprobar</button>`);
          actions.push(`<button type="button" class="btn btn-danger btn-sm" data-action="open-reject" data-app-id="${esc(a.id)}">Rechazar</button>`);
        }
        return `
        <tr>
          <td class="cell-strong">#${esc(a.id)}</td>
          <td>
            <button type="button" class="link-btn" data-action="goto" data-view="deudorDetail" data-user-id="${esc(a.deudor ? a.deudor.id : "")}">
              ${esc(a.deudor ? a.deudor.nombres : "—")}
            </button>
          </td>
          <td class="cell-muted">${fmtMoney(a.monto)}</td>
          <td class="cell-muted">${a.meses}m · ${a.tasa}%</td>
          <td>${badgeForEstado(a.estado)}</td>
          <td class="cell-muted">${esc(a.fechaSolicitud)}</td>
          <td><div class="btn-row">${actions.join("")}</div></td>
        </tr>`;
      })
      .join("");

    return `
      <div class="btn-row" style="margin-bottom:1rem;">
        ${filters
          .map(
            (f) =>
              `<button type="button" class="btn ${state.filterEstado === f.key ? "btn-primary" : "btn-secondary"} btn-sm" data-action="filter-solicitudes" data-estado="${f.key}">${esc(f.label)}</button>`
          )
          .join("")}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Deudor</th><th>Monto</th><th>Plazo</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="7" class="table-empty">No hay solicitudes en esta categoría.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Modales                                                          */
  /* -------------------------------------------------------------- */

  function findAppEverywhere(appId) {
    return (
      state.applications.find((a) => a.id === appId) ||
      (state.selectedUserApps || []).find((a) => a.id === appId)
    );
  }

  function renderModal() {
    if (!state.modal) return "";
    const { type, data } = state.modal;

    if (type === "edit-user") {
      const u = state.selectedUser;
      return modalWrap(
        "Editar datos del deudor",
        `
        ${field("Nombres", textInput("m-nombres", { value: u.nombres }))}
        ${field("Cédula", textInput("m-cedula", { value: u.cedula }))}
        ${field("Teléfono", textInput("m-telefono", { value: u.telefono }))}
        ${field("Correo", textInput("m-correo", { value: u.correo, type: "email" }))}
        ${field("Dirección", textInput("m-direccion", { value: u.direccion }))}
        ${state.modalError ? `<p class="form-error">${esc(state.modalError)}</p>` : ""}
        <div class="btn-row">
          <button type="button" class="btn btn-primary" data-action="save-edit-user" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Guardando..." : "Guardar cambios"}</button>
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
        </div>`
      );
    }

    if (type === "edit-loan") {
      const a = findAppEverywhere(data.appId);
      if (!a) return "";
      return modalWrap(
        `Editar condiciones — #${esc(a.id)}`,
        `
        <div class="form-grid-2">
          ${field("Monto (RD$)", textInput("m-monto", { value: a.monto, type: "number" }))}
          ${field("Plazo (meses)", textInput("m-meses", { value: a.meses, type: "number" }))}
        </div>
        ${field("Tasa anual % (opcional, si no la calculamos automático)", textInput("m-tasa", { value: a.tasa, type: "number" }))}
        <p class="cell-muted" style="margin-bottom:0.9rem;">Si el préstamo ya tiene cuotas pagadas, el calendario de pagos no se regenera.</p>
        ${state.modalError ? `<p class="form-error">${esc(state.modalError)}</p>` : ""}
        <div class="btn-row">
          <button type="button" class="btn btn-primary" data-action="save-edit-loan" data-app-id="${esc(a.id)}" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Guardando..." : "Guardar cambios"}</button>
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
        </div>`
      );
    }

    if (type === "reject") {
      return modalWrap(
        `Rechazar solicitud — #${esc(data.appId)}`,
        `
        ${field("Motivo (opcional)", `<textarea id="m-motivo" class="text-input" rows="3"></textarea>`)}
        ${state.modalError ? `<p class="form-error">${esc(state.modalError)}</p>` : ""}
        <div class="btn-row">
          <button type="button" class="btn btn-danger" data-action="save-reject" data-app-id="${esc(data.appId)}" ${state.modalBusy ? "disabled" : ""}>${state.modalBusy ? "Rechazando..." : "Confirmar rechazo"}</button>
          <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
        </div>`
      );
    }

    if (type === "receipt") {
      const r = data.receipt;
      return `
        <div class="modal-overlay" data-action="close-modal-overlay">
          <div class="modal-box" onclick="event.stopPropagation()">
            <div id="print-area" class="receipt-box">
              <h2>Juranyi</h2>
              <p class="muted">Recibo de pago #${esc(r.recibo)}</p>
              <p class="muted">Emitido: ${esc(r.fechaEmision)}</p>
              <div class="divider" style="border-top:1px solid #ddd;margin:0.75rem 0;"></div>
              <div class="receipt-row"><span>Deudor</span><span>${esc(r.deudor ? r.deudor.nombres : "—")}</span></div>
              <div class="receipt-row"><span>Cédula</span><span>${esc(r.deudor ? r.deudor.cedula : "—")}</span></div>
              <div class="receipt-row"><span>Préstamo</span><span>#${esc(r.prestamo.id)}</span></div>
              <div class="receipt-row"><span>Cuota</span><span>#${r.cuota.num} de ${r.prestamo.meses}</span></div>
              <div class="receipt-row"><span>Fecha de la cuota</span><span>${esc(r.cuota.fecha)}</span></div>
              <div class="receipt-row"><span>Fecha de pago</span><span>${esc(r.cuota.fechaPago || "—")}</span></div>
              <div class="receipt-row total"><span>Monto pagado</span><span>${fmtMoney(r.cuota.cuota)}</span></div>
            </div>
            <div class="btn-row" style="margin-top:1rem;">
              <button type="button" class="btn btn-primary" data-action="do-print">${Icon("file-text", { size: 15 })} Imprimir</button>
              <button type="button" class="btn btn-secondary" data-action="close-modal">Cerrar</button>
            </div>
          </div>
        </div>`;
    }

    return "";
  }

  function modalWrap(title, bodyHtml) {
    return `
      <div class="modal-overlay" data-action="close-modal-overlay">
        <div class="modal-box" onclick="event.stopPropagation()">
          <p class="modal-title">${esc(title)}</p>
          ${bodyHtml}
        </div>
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Root render                                                      */
  /* -------------------------------------------------------------- */

  function render() {
    const root = document.getElementById("admin-app");
    if (!state.token) {
      root.innerHTML = screenLogin();
      return;
    }

    let title = "Resumen";
    let sub = "Vista general del negocio";
    let body = "";
    if (state.view === "dashboard") {
      title = "Resumen";
      body = screenDashboard();
    } else if (state.view === "deudores") {
      title = "Deudores";
      sub = `${state.users.length} deudor(es) registrados`;
      body = screenDeudores();
    } else if (state.view === "deudorDetail") {
      title = state.selectedUser ? state.selectedUser.nombres : "Deudor";
      sub = "Detalle del deudor";
      body = screenDeudorDetail();
    } else if (state.view === "solicitudes") {
      title = "Solicitudes y préstamos";
      sub = `${state.applications.length} resultado(s)`;
      body = screenSolicitudes();
    }

    const errorBanner = state.globalError
      ? `<div class="banner"><span>${esc(state.globalError)}</span><button type="button" data-action="dismiss-error">${Icon("x", { size: 13 })}</button></div>`
      : "";

    root.innerHTML = `
      <div class="admin-shell">
        ${sidebar()}
        <div class="main-area">
          <div class="topbar">
            <div><h1>${esc(title)}</h1><div class="topbar-sub">${esc(sub)}</div></div>
          </div>
          <div class="content">
            ${errorBanner}
            ${body}
          </div>
        </div>
      </div>
      ${renderModal()}`;
  }

  /* -------------------------------------------------------------- */
  /*  Actions: login/logout                                            */
  /* -------------------------------------------------------------- */

  async function doLogin(correo, password) {
    const data = await api("/admin/login", { method: "POST", body: { correo, password } });
    state.token = data.token;
    state.admin = data.admin;
    localStorage.setItem("juranyi_admin_token", data.token);
    state.view = "dashboard";
    render();
    loadDashboard();
  }

  function doLogout() {
    state.token = null;
    state.admin = null;
    localStorage.removeItem("juranyi_admin_token");
    render();
  }

  /* -------------------------------------------------------------- */
  /*  Event wiring                                                     */
  /* -------------------------------------------------------------- */

  const root = document.getElementById("admin-app");

  root.addEventListener("submit", async (e) => {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    if (form.getAttribute("data-form") === "admin-login") {
      const correo = document.getElementById("admin-correo").value;
      const password = document.getElementById("admin-password").value;
      if (!correo || !password) {
        state.loginError = "Ingresa correo y contraseña.";
        render();
        return;
      }
      state.loginError = "";
      state.loginBusy = true;
      render();
      try {
        await doLogin(correo, password);
      } catch (err) {
        state.loginError = err.message;
      } finally {
        state.loginBusy = false;
        if (!state.token) render();
      }
    }
  });

  root.addEventListener("click", async (e) => {
    const overlay = e.target.closest("[data-action='close-modal-overlay']");
    if (overlay && e.target === overlay) {
      state.modal = null;
      state.modalError = "";
      render();
      return;
    }

    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.getAttribute("data-action");

    switch (action) {
      case "goto": {
        const view = t.getAttribute("data-view");
        const extra = {};
        if (t.hasAttribute("data-user-id")) extra.selectedUserId = t.getAttribute("data-user-id");
        if (t.hasAttribute("data-filter")) extra.filterEstado = t.getAttribute("data-filter");
        goto(view, extra);
        break;
      }

      case "admin-logout":
        doLogout();
        break;

      case "dismiss-error":
        state.globalError = "";
        render();
        break;

      case "filter-solicitudes":
        state.filterEstado = t.getAttribute("data-estado");
        render();
        loadApplications();
        break;

      case "open-edit-user":
        state.modal = { type: "edit-user" };
        state.modalError = "";
        render();
        break;

      case "toggle-block-user": {
        const block = t.getAttribute("data-block") === "1";
        try {
          await api(`/admin/users/${state.selectedUser.id}`, { method: "PATCH", body: { estado: block ? "bloqueado" : "activo" } });
          await loadUserDetail(state.selectedUser.id);
        } catch (err) {
          state.globalError = err.message;
          render();
        }
        break;
      }

      case "open-edit-loan":
        state.modal = { type: "edit-loan", data: { appId: t.getAttribute("data-app-id") } };
        state.modalError = "";
        render();
        break;

      case "open-reject":
        state.modal = { type: "reject", data: { appId: t.getAttribute("data-app-id") } };
        state.modalError = "";
        render();
        break;

      case "close-modal":
        state.modal = null;
        state.modalError = "";
        render();
        break;

      case "approve-app": {
        const appId = t.getAttribute("data-app-id");
        try {
          await api(`/admin/applications/${appId}/approve`, { method: "POST" });
          await refreshCurrentView();
        } catch (err) {
          state.globalError = err.message;
          render();
        }
        break;
      }

      case "save-reject": {
        const appId = t.getAttribute("data-app-id");
        const motivo = document.getElementById("m-motivo").value;
        state.modalBusy = true;
        render();
        try {
          await api(`/admin/applications/${appId}/reject`, { method: "POST", body: { motivo } });
          state.modal = null;
          await refreshCurrentView();
        } catch (err) {
          state.modalError = err.message;
        } finally {
          state.modalBusy = false;
          render();
        }
        break;
      }

      case "save-edit-user": {
        const body = {
          nombres: document.getElementById("m-nombres").value,
          cedula: document.getElementById("m-cedula").value,
          telefono: document.getElementById("m-telefono").value,
          correo: document.getElementById("m-correo").value,
          direccion: document.getElementById("m-direccion").value,
        };
        state.modalBusy = true;
        render();
        try {
          await api(`/admin/users/${state.selectedUser.id}`, { method: "PATCH", body });
          state.modal = null;
          await loadUserDetail(state.selectedUser.id);
        } catch (err) {
          state.modalError = err.message;
        } finally {
          state.modalBusy = false;
          render();
        }
        break;
      }

      case "save-edit-loan": {
        const appId = t.getAttribute("data-app-id");
        const body = {
          monto: Number(document.getElementById("m-monto").value),
          meses: Number(document.getElementById("m-meses").value),
        };
        const tasaVal = document.getElementById("m-tasa").value;
        if (tasaVal) body.tasa = Number(tasaVal);
        state.modalBusy = true;
        render();
        try {
          await api(`/admin/applications/${appId}`, { method: "PATCH", body });
          state.modal = null;
          await refreshCurrentView();
        } catch (err) {
          state.modalError = err.message;
        } finally {
          state.modalBusy = false;
          render();
        }
        break;
      }

      case "mark-paid": {
        const appId = t.getAttribute("data-app-id");
        const num = t.getAttribute("data-num");
        try {
          await api(`/admin/applications/${appId}/payments/${num}/mark-paid`, { method: "POST" });
          await refreshCurrentView();
        } catch (err) {
          state.globalError = err.message;
          render();
        }
        break;
      }

      case "mark-late": {
        const appId = t.getAttribute("data-app-id");
        const num = t.getAttribute("data-num");
        try {
          await api(`/admin/applications/${appId}/payments/${num}/mark-late`, { method: "POST" });
          await refreshCurrentView();
        } catch (err) {
          state.globalError = err.message;
          render();
        }
        break;
      }

      case "print-receipt": {
        const appId = t.getAttribute("data-app-id");
        const num = t.getAttribute("data-num");
        try {
          const data = await api(`/admin/applications/${appId}/receipt/${num}`);
          state.modal = { type: "receipt", data: { receipt: data.receipt } };
          render();
        } catch (err) {
          state.globalError = err.message;
          render();
        }
        break;
      }

      case "do-print":
        window.print();
        break;

      default:
        break;
    }
  });

  async function refreshCurrentView() {
    if (state.view === "deudorDetail" && state.selectedUser) await loadUserDetail(state.selectedUser.id);
    else if (state.view === "solicitudes") await loadApplications();
    else if (state.view === "dashboard") await loadDashboard();
    else render();
  }

  /* -------------------------------------------------------------- */
  /*  Boot                                                             */
  /* -------------------------------------------------------------- */

  render();
  if (state.token) {
    // Intenta reanudar sesión; si el token expiró, cualquier llamada fallará
    // con 401 y el admin puede volver a iniciar sesión.
    loadDashboard();
  }
})();
