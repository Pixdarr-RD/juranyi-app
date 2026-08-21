/* ======================================================================
   Juranyi — versión HTML + CSS + JS puro (sin React, sin Vite, sin JSX)
   Reimplementación fiel de App.jsx usando:
     - manipulación directa del DOM
     - un pequeño "router" de pantallas (stack + tabs), igual que el original
     - fetch() contra el mismo backend
   ====================================================================== */

(function () {
  "use strict";

  /* -------------------------------------------------------------- */
  /*  Backend connection                                              */
  /* -------------------------------------------------------------- */

  const DEFAULT_API_URL = (window.JURANYI_CONFIG && window.JURANYI_CONFIG.apiUrl) || "http://localhost:4000/api";

  async function apiFetch(apiUrl, token, path, opts) {
    opts = opts || {};
    let res;
    try {
      res = await fetch(`${apiUrl}${path}`, {
        method: opts.method || "GET",
        headers: Object.assign(
          { "Content-Type": "application/json" },
          token ? { Authorization: `Bearer ${token}` } : {}
        ),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (networkErr) {
      throw new Error("No se pudo conectar al servidor. Verifica la URL del backend y que esté corriendo.");
    }
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      /* respuesta vacía */
    }
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }

  /* -------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* -------------------------------------------------------------- */

  function fmtMoney(n) {
    return `RD$ ${Math.round(n).toLocaleString("es-DO")}`;
  }

  function rateForTerm(months) {
    return { 3: 28, 6: 24, 12: 22, 18: 20 }[months];
  }

  function simulateLoan(monto, meses) {
    const tasa = rateForTerm(meses);
    const interes = monto * (tasa / 100) * (meses / 12);
    const total = monto + interes;
    const cuota = total / meses;
    return { tasa, interes, total, cuota };
  }

  function esc(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const MILESTONES = [
    { key: "recibida", label: "Solicitud recibida" },
    { key: "evaluacion", label: "En evaluación", sub: "Estamos verificando tu información" },
    { key: "aprobacion", label: "Aprobación" },
    { key: "desembolso", label: "Desembolso" },
  ];

  /* -------------------------------------------------------------- */
  /*  Global + ephemeral (per-screen) state                           */
  /* -------------------------------------------------------------- */

  const state = {
    apiUrl: DEFAULT_API_URL,
    token: null,
    appState: "splash", // splash | auth | main
    authMode: "login",
    user: null,
    tab: "home",
    stack: [], // [{screen, props}]
    applications: [],
    history: [],
    notifications: [],
    pendingRequestTerms: null,
    syncing: false,
    globalError: "",
  };

  // Estado temporal de cada pantalla con formularios (se reinicia al entrar).
  const authUI = {
    showPass: false,
    showServerCfg: false,
    busy: false,
    error: "",
    regForm: { nombres: "", cedula: "", telefono: "", correo: "", password: "", accepted: false },
    loginForm: { correo: "", password: "" },
  };
  const simUI = { monto: 20000, meses: 6 };
  const reqUI = { step: 1, busy: false, error: "", form: null };
  const statusUI = { busy: false, error: "" };
  const calUI = { payingNum: null, error: "" };

  function push(screen, props) {
    state.stack.push({ screen, props: props || {} });
    render();
  }
  function pop() {
    state.stack.pop();
    render();
  }
  function popToTab(newTab) {
    state.stack = [];
    state.tab = newTab;
    render();
  }

  function api(path, opts) {
    return apiFetch(state.apiUrl, state.token, path, opts);
  }

  /* -------------------------------------------------------------- */
  /*  Backend sync                                                     */
  /* -------------------------------------------------------------- */

  async function refreshAll(activeToken) {
    state.syncing = true;
    state.globalError = "";
    try {
      const [appsRes, histRes, notifRes] = await Promise.all([
        apiFetch(state.apiUrl, activeToken || state.token, "/applications"),
        apiFetch(state.apiUrl, activeToken || state.token, "/applications/history"),
        apiFetch(state.apiUrl, activeToken || state.token, "/notifications"),
      ]);
      state.applications = appsRes.applications || [];
      state.history = histRes.history || [];
      state.notifications = notifRes.notifications || [];
    } catch (err) {
      state.globalError = err.message;
    } finally {
      state.syncing = false;
      render();
    }
  }

  async function handleRegister(formValues) {
    const data = await api("/auth/register", { method: "POST", body: formValues });
    state.token = data.token;
    state.user = data.user;
    state.appState = "main";
    render();
    await refreshAll(data.token);
  }

  async function handleLogin(correo, password) {
    const data = await api("/auth/login", { method: "POST", body: { correo, password } });
    state.token = data.token;
    state.user = data.user;
    state.appState = "main";
    render();
    await refreshAll(data.token);
  }

  function handleLogout() {
    state.token = null;
    state.user = null;
    state.applications = [];
    state.history = [];
    state.notifications = [];
    state.appState = "splash";
    state.stack = [];
    state.tab = "home";
    state.authMode = "login";
    render();
  }

  function startRequest(terms) {
    state.pendingRequestTerms = terms;
    reqUI.step = 1;
    reqUI.error = "";
    reqUI.form = null; // se inicializa al montar la pantalla, con datos del usuario
    push("request", { loanTerms: terms });
  }

  async function submitApplication(formData) {
    const data = await api("/applications", {
      method: "POST",
      body: { monto: state.pendingRequestTerms.monto, meses: state.pendingRequestTerms.meses, formData },
    });
    const app = data.application;
    state.applications.unshift(app);
    state.stack = [{ screen: "success", props: { appId: app.id } }];
    render();
    refreshAll();
  }

  async function advanceApplication(appId) {
    const data = await api(`/applications/${appId}/advance`, { method: "POST" });
    state.applications = state.applications.map((a) => (a.id === appId ? data.application : a));
    render();
    refreshAll();
  }

  async function payInstallment(loanId, num) {
    const data = await api(`/applications/${loanId}/payments/${num}/pay`, { method: "POST" });
    state.applications = state.applications.map((a) => (a.id === loanId ? data.application : a));
    render();
    refreshAll();
  }

  async function markAllRead() {
    state.notifications = state.notifications.map((n) => Object.assign({}, n, { read: true }));
    render();
    try {
      await api("/notifications/read-all", { method: "POST" });
    } catch (err) {
      state.globalError = err.message;
      render();
    }
  }

  function pendingApp() {
    return state.applications.find((a) => a.estado === "en_evaluacion");
  }
  function activeLoan() {
    return state.applications.find((a) => a.estado === "activo");
  }
  function unreadCount() {
    return state.notifications.filter((n) => !n.read).length;
  }

  /* -------------------------------------------------------------- */
  /*  Small UI-building blocks (return HTML strings)                   */
  /* -------------------------------------------------------------- */

  function Icon(name, opts) {
    return window.Icon(name, opts);
  }

  function logo(size) {
    const cls = size === "lg" ? "logo-lg" : size === "sm" ? "logo-sm" : "logo-md";
    return `<span class="logo ${cls}">J</span>`;
  }

  function primaryButton(label, action, opts) {
    opts = opts || {};
    const disabled = opts.disabled ? "disabled" : "";
    const type = opts.type || "button";
    const extraAttrs = opts.attrs || "";
    return `<button type="${type}" class="btn btn-primary" data-action="${action}" ${disabled} ${extraAttrs}>${label}</button>`;
  }

  function secondaryButton(label, action, opts) {
    opts = opts || {};
    const disabled = opts.disabled ? "disabled" : "";
    return `<button type="button" class="btn btn-secondary" data-action="${action}" ${disabled}>${label}</button>`;
  }

  function field(label, innerHtml) {
    return `<label class="field"><span class="field-label">${esc(label)}</span>${innerHtml}</label>`;
  }

  function textInput(id, opts) {
    opts = opts || {};
    const type = opts.type || "text";
    const placeholder = opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : "";
    const value = opts.value !== undefined ? `value="${esc(opts.value)}"` : "";
    return `<input id="${id}" type="${type}" class="text-input" ${placeholder} ${value} />`;
  }

  function badge(label, tone) {
    return `<span class="badge badge-${tone || "success"}">${label}</span>`;
  }

  function card(innerHtml, extraClass) {
    return `<div class="card ${extraClass || ""}">${innerHtml}</div>`;
  }

  function row(label, value, highlight) {
    return `<div class="row"><span class="row-label">${esc(label)}</span><span class="row-value ${highlight ? "highlight" : ""}">${value}</span></div>`;
  }

  function screenHeader(title, hasBack, rightHtml) {
    return `
      <div class="screen-header">
        <div class="screen-header-left">
          ${hasBack ? `<button type="button" class="btn-ghost-back" data-action="pop">${Icon("arrow-left", { size: 20 })}</button>` : ""}
          <h1 class="title-lg">${esc(title)}</h1>
        </div>
        <div>${rightHtml || ""}</div>
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Screens                                                          */
  /* -------------------------------------------------------------- */

  function screenSplash() {
    return `
      <div class="screen px-6 py-14" style="justify-content:space-between;background:linear-gradient(to bottom, var(--slate-950), var(--slate-900));">
        <div></div>
        <div class="text-center">
          <div class="mb-4">${logo("lg")}</div>
          <h1 class="title-xl" style="font-size:1.875rem;letter-spacing:-0.02em;">JURANYI</h1>
          <p class="text-muted text-sm mt-1">Préstamos que impulsan tus sueños</p>
        </div>
        <div class="space-y-3">
          ${primaryButton("Comenzar", "start")}
          <p class="text-center text-xs text-faint">🇩🇴 República Dominicana</p>
        </div>
      </div>`;
  }

  function serverConfigBlock() {
    return `
      <div class="mt-4">
        <button type="button" class="server-cfg-toggle" data-action="auth-toggle-servercfg">⚙️ URL del servidor</button>
        <div id="server-cfg-panel" style="display:${authUI.showServerCfg ? "block" : "none"};margin-top:0.5rem;">
          ${textInput("server-url-input", { value: state.apiUrl, placeholder: DEFAULT_API_URL })}
          <p class="hint-tiny">Apunta esto a donde esté corriendo tu backend de Juranyi.</p>
        </div>
      </div>`;
  }

  function screenAuth() {
    if (state.authMode === "register") {
      const f = authUI.regForm;
      return `
        <div class="screen-scroll px-6 py-8">
          <h1 class="title-xl mb-1">Crear cuenta</h1>
          <p class="text-muted text-sm mb-6">Completa tus datos para comenzar</p>
          <form data-form="register">
            ${field("Nombres", textInput("reg-nombres", { placeholder: "Juan Pérez", value: f.nombres }))}
            ${field("Cédula", textInput("reg-cedula", { placeholder: "001-1234567-8", value: f.cedula }))}
            ${field("Teléfono", textInput("reg-telefono", { placeholder: "(809) 123-4567", value: f.telefono }))}
            ${field("Correo electrónico", textInput("reg-correo", { type: "email", placeholder: "juanperez@gmail.com", value: f.correo }))}
            ${field(
              "Contraseña",
              `<div class="input-wrap">
                ${textInput("reg-password", { type: authUI.showPass ? "text" : "password", placeholder: "••••••••••", value: f.password })}
                <button type="button" class="input-eye" data-action="auth-toggle-pass">${Icon(authUI.showPass ? "eye-off" : "eye", { size: 16 })}</button>
              </div>`
            )}
            <label class="checkbox-row">
              <input type="checkbox" id="reg-accepted" ${f.accepted ? "checked" : ""} />
              <span>Acepto los <span class="text-teal">Términos y Condiciones</span> y la <span class="text-teal">Política de Privacidad</span></span>
            </label>
            ${authUI.error ? `<p class="form-error">${esc(authUI.error)}</p>` : ""}
            ${primaryButton(authUI.busy ? "Creando cuenta..." : "Crear cuenta", "auth-submit-register", { type: "submit", disabled: authUI.busy })}
            <p class="text-center text-sm text-muted mt-4">
              ¿Ya tienes cuenta? <button type="button" class="link-btn" data-action="auth-switch" data-mode="login">Inicia sesión</button>
            </p>
            ${serverConfigBlock()}
          </form>
        </div>`;
    }

    const f = authUI.loginForm;
    return `
      <div class="screen px-6 py-8" style="justify-content:center;">
        <div class="text-center mb-8">
          ${logo()}
          <h1 class="title-xl mt-3">¡Bienvenido de nuevo!</h1>
          <p class="text-muted text-sm mt-1">Inicia sesión para continuar</p>
        </div>
        <form data-form="login">
          ${field("Correo electrónico o teléfono", textInput("login-correo", { placeholder: "juanperez@gmail.com", value: f.correo }))}
          ${field(
            "Contraseña",
            `<div class="input-wrap">
              ${textInput("login-password", { type: authUI.showPass ? "text" : "password", placeholder: "••••••••••", value: f.password })}
              <button type="button" class="input-eye" data-action="auth-toggle-pass">${Icon(authUI.showPass ? "eye-off" : "eye", { size: 16 })}</button>
            </div>`
          )}
          <p class="text-right text-xs text-teal mb-5">¿Olvidaste tu contraseña?</p>
          ${authUI.error ? `<p class="form-error">${esc(authUI.error)}</p>` : ""}
          ${primaryButton(authUI.busy ? "Ingresando..." : "Iniciar sesión", "auth-submit-login", { type: "submit", disabled: authUI.busy })}
          <p class="text-center text-sm text-muted mt-4">
            ¿No tienes cuenta? <button type="button" class="link-btn" data-action="auth-switch" data-mode="register">Regístrate</button>
          </p>
          ${serverConfigBlock()}
        </form>
      </div>`;
  }

  function quickAccess(iconName, label, action, dataAttrs) {
    return `<button type="button" class="quick-access" data-action="${action}" ${dataAttrs || ""}>
      <div class="qa-icon">${Icon(iconName, { size: 18 })}</div>
      <p class="qa-label">${esc(label)}</p>
    </button>`;
  }

  function screenHome() {
    const user = state.user;
    const loan = activeLoan();
    const pending = pendingApp();

    let heroCard;
    if (loan) {
      const proximo = loan.pagos.find((p) => p.estado === "Pendiente");
      heroCard = card(
        `<div class="flex justify-between items-start mb-1">
          <p class="text-faint text-xs">Préstamo actual</p>
          ${badge("Activo", "success")}
        </div>
        <p class="title-xl mb-3" style="font-size:1.5rem;">${fmtMoney(loan.monto)}</p>
        <div class="flex justify-between text-xs mb-4">
          <div><p class="text-faint">Próximo pago</p><p class="row-value">${esc(proximo ? proximo.fecha : "—")}</p></div>
          <div class="text-right"><p class="text-faint">Monto a pagar</p><p class="row-value">${fmtMoney(loan.cuota)}</p></div>
        </div>
        ${primaryButton("Ver préstamo", "push", { attrs: 'data-screen="loanDetail"' })}`,
        "card-gradient mb-5"
      );
    } else if (pending) {
      heroCard = card(
        `<div class="flex justify-between items-start mb-1">
          <p class="text-faint text-xs">Solicitud en proceso</p>
          ${badge("En evaluación", "pending")}
        </div>
        <p class="title-lg mb-1">${fmtMoney(pending.monto)}</p>
        <p class="text-faint text-xs mb-4">#${esc(pending.id)}</p>
        ${primaryButton("Ver estado", "push", { attrs: `data-screen="status" data-app-id="${esc(pending.id)}"` })}`,
        "mb-5"
      );
    } else {
      heroCard = card(
        `<div class="text-teal mb-2">${Icon("sparkles", { size: 22 })}</div>
        <p class="row-value" style="color:#fff;">Empieza tu solicitud</p>
        <p class="text-faint text-xs mb-4" style="margin-top:0.25rem;">Simula tu préstamo y descubre tu cuota ideal en segundos.</p>
        ${primaryButton("Simular préstamo", "push", { attrs: 'data-screen="simulator"' })}`,
        "mb-5"
      );
    }

    return `
      <div class="screen-scroll px-5 pt-5 pb-6">
        <div class="flex justify-between items-center mb-5">
          <div>
            <h1 class="title-lg">¡Hola, ${esc(user.nombres.split(" ")[0])}! 👋</h1>
            <p class="text-faint text-xs mt-1">Bienvenido a Juranyi</p>
          </div>
          <div class="avatar">${esc(user.nombres[0])}</div>
        </div>
        ${heroCard}
        <p class="text-faint text-xs mb-2" style="font-weight:600;">Accesos rápidos</p>
        <div class="grid-2">
          ${quickAccess("trending-up", "Simular préstamo", "push", 'data-screen="simulator"')}
          ${
            pending
              ? quickAccess("file-text", "Solicitar préstamo", "push", `data-screen="status" data-app-id="${esc(pending.id)}"`)
              : quickAccess("file-text", "Solicitar préstamo", "push", 'data-screen="simulator"')
          }
          ${quickAccess("clock", "Historial", "push", 'data-screen="history"')}
          ${loan ? quickAccess("wallet", "Mis pagos", "push", 'data-screen="calendar"') : quickAccess("wallet", "Mis pagos", "push", 'data-screen="simulator"')}
        </div>
      </div>`;
  }

  function screenSimulator() {
    const sim = simulateLoan(simUI.monto, simUI.meses);
    const terms = [3, 6, 12, 18];
    return `
      <div class="screen-scroll">
        ${screenHeader("Simular préstamo", true)}
        <div class="px-5 pb-6">
          <p class="text-faint text-xs mb-2">¿Cuánto dinero necesitas?</p>
          <p id="sim-monto-label" class="title-xl mb-3" style="font-size:1.875rem;">${fmtMoney(simUI.monto)}</p>
          <input type="range" id="sim-monto-slider" min="1000" max="100000" step="500" value="${simUI.monto}" />
          <div class="flex justify-between text-xs text-faint mb-6">
            <span>RD$ 1,000</span><span>RD$ 100,000</span>
          </div>

          <p class="text-faint text-xs mb-2">¿En cuántos meses?</p>
          <div class="grid-4 mb-6">
            ${terms
              .map(
                (m) =>
                  `<button type="button" class="term-btn ${m === simUI.meses ? "active" : ""}" data-action="sim-set-meses" data-meses="${m}">${m} meses</button>`
              )
              .join("")}
          </div>

          ${card(
            `<p class="row-value" style="color:#fff;margin-bottom:0.75rem;">Tu simulación</p>
            <div id="sim-results">${simResultsRows(simUI.monto, simUI.meses, sim)}</div>`,
            "mb-4"
          )}

          <div class="pb-2">${primaryButton("Solicitar este préstamo", "sim-request")}</div>
        </div>
      </div>`;
  }

  function simResultsRows(monto, meses, sim) {
    return (
      row("Monto solicitado", fmtMoney(monto)) +
      row(`Interés (${meses} meses)`, fmtMoney(sim.interes)) +
      row("Total a pagar", fmtMoney(sim.total)) +
      `<div class="divider"></div>` +
      row("Cuota mensual", fmtMoney(sim.cuota), true) +
      `<p class="hint-tiny" style="margin-top:0.5rem;">* Tasa de interés anual ${sim.tasa}%</p>`
    );
  }

  function screenRequest(loanTerms) {
    if (!reqUI.form) {
      const u = state.user;
      reqUI.form = {
        nombres: u.nombres || "",
        cedula: u.cedula || "",
        telefono: u.telefono || "",
        direccion: u.direccion || "",
        fechaNacimiento: u.fechaNacimiento || "",
        estadoCivil: u.estadoCivil || "",
      };
    }
    const f = reqUI.form;
    const steps = ["Información", "Verificación", "Confirmación"];
    const step = reqUI.step;

    const stepperHtml = `
      <div class="stepper">
        ${steps
          .map((s, i) => {
            const n = i + 1;
            const cls = step > n ? "done" : step === n ? "current" : "";
            const dotContent = step > n ? Icon("check", { size: 13 }) : n;
            return `<div class="step-item">
              <div class="step-dot ${cls}">${dotContent}</div>
              <span class="step-label">${esc(s)}</span>
            </div>${i < steps.length - 1 ? '<div class="step-line"></div>' : ""}`;
          })
          .join("")}
      </div>`;

    let body = "";
    if (step === 1) {
      body = `
        <p class="row-value" style="color:#fff;margin-bottom:0.75rem;">Información personal</p>
        ${field("Nombres completos", textInput("req-nombres", { value: f.nombres }))}
        ${field("Cédula", textInput("req-cedula", { value: f.cedula }))}
        ${field("Teléfono", textInput("req-telefono", { value: f.telefono }))}
        ${field("Dirección", textInput("req-direccion", { placeholder: "Calle Principal #123, Santo Domingo", value: f.direccion }))}
        ${field("Fecha de nacimiento", textInput("req-fecha", { type: "date", value: f.fechaNacimiento }))}
        ${field(
          "Estado civil",
          `<select id="req-estadocivil" class="text-input">
            <option value="" ${!f.estadoCivil ? "selected" : ""}>Selecciona</option>
            ${["Soltero", "Casado", "Unión libre", "Divorciado"]
              .map((o) => `<option ${f.estadoCivil === o ? "selected" : ""}>${o}</option>`)
              .join("")}
          </select>`
        )}
        ${primaryButton("Continuar", "req-continue-1")}`;
    } else if (step === 2) {
      body = `
        <p class="row-value" style="color:#fff;margin-bottom:0.75rem;">Verificación de identidad</p>
        ${card(
          `<div class="flex items-start gap-3">
            <span class="text-teal shrink-0" style="margin-top:0.1rem;">${Icon("shield", { size: 18 })}</span>
            <p class="text-faint text-xs">Confirmamos que tus datos coinciden con tu cédula. No necesitas subir documentos adicionales para esta simulación.</p>
          </div>`,
          "mb-5"
        )}
        ${card(row("Nombres", esc(f.nombres)) + row("Cédula", esc(f.cedula)) + row("Teléfono", esc(f.telefono)), "mb-5")}
        ${primaryButton("Continuar", "req-continue-2")}`;
    } else {
      body = `
        <p class="row-value" style="color:#fff;margin-bottom:0.75rem;">Confirmación</p>
        ${card(
          row("Monto solicitado", fmtMoney(loanTerms.monto)) +
            row("Plazo", `${loanTerms.meses} meses`) +
            row("Tasa de interés anual", `${loanTerms.tasa}%`) +
            `<div class="divider"></div>` +
            row("Total a pagar", fmtMoney(loanTerms.total), true) +
            row("Cuota mensual", fmtMoney(loanTerms.cuota)),
          "mb-5"
        )}
        ${reqUI.error ? `<p class="form-error">${esc(reqUI.error)}</p>` : ""}
        ${primaryButton(reqUI.busy ? "Enviando..." : "Continuar", "req-submit", { disabled: reqUI.busy })}`;
    }

    return `
      <div class="screen-scroll">
        ${screenHeader("Solicitud de préstamo", true)}
        ${stepperHtml}
        <div class="px-5 pb-6">${body}</div>
      </div>`;
  }

  function screenSuccess(appId) {
    return `
      <div class="screen px-6 py-10" style="align-items:center;text-align:center;">
        <div style="width:5rem;height:5rem;border-radius:999px;background:rgba(16,185,129,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:1.5rem;">
          <span style="color:var(--emerald-400);">${Icon("check-circle-2", { size: 40 })}</span>
        </div>
        <h1 class="title-lg mb-2">¡Solicitud enviada!</h1>
        <p class="text-muted text-sm mb-6">Hemos recibido tu solicitud de préstamo correctamente.</p>
        ${card(`<p class="text-faint text-xs mb-1">Número de solicitud</p><p class="text-teal" style="font-weight:700;">#${esc(appId)}</p>`, "w-full mb-8")}
        <div class="w-full mt-auto space-y-3">
          ${primaryButton("Ver estado", "success-goto-status", { attrs: `data-app-id="${esc(appId)}"` })}
          ${secondaryButton("Ir al inicio", "success-goto-home")}
        </div>
      </div>`;
  }

  function screenStatus(app) {
    const idx = app.milestoneIndex;
    const milestonesHtml = MILESTONES.map((m, i) => {
      const done = i < idx || (app.estado === "activo" && i <= idx);
      const current = i === idx && app.estado !== "activo";
      const dotCls = done ? "done" : current ? "current" : "";
      const dotContent = done ? Icon("check", { size: 13 }) : Icon("circle", { size: 8, fill: "currentColor" });
      const lineCls = done ? "done" : "";
      const titleCls = done || current ? "active" : "";
      const sub = current ? m.sub || "En proceso" : done ? "Completado" : "Pendiente";
      return `<div class="timeline-item">
        <div class="timeline-dot-col">
          <div class="timeline-dot ${dotCls}">${dotContent}</div>
          ${i < MILESTONES.length - 1 ? `<div class="timeline-line ${lineCls}"></div>` : ""}
        </div>
        <div class="timeline-content">
          <p class="timeline-title ${titleCls}">${esc(m.label)}</p>
          <p class="timeline-sub">${esc(sub)}</p>
        </div>
      </div>`;
    }).join("");

    const bottom =
      app.estado !== "activo"
        ? `${card(
            `<div class="flex items-start gap-2">
              <span class="shrink-0" style="color:var(--sky-400);">${Icon("info", { size: 16 })}</span>
              <p class="text-faint text-xs">Este proceso puede tardar hasta 24 horas. Te notificaremos cuando tengamos una respuesta.</p>
            </div>`,
            "mb-4 card-tint-sky"
          )}
          ${statusUI.error ? `<p class="form-error">${esc(statusUI.error)}</p>` : ""}
          ${secondaryButton(statusUI.busy ? "Actualizando..." : "Avanzar solicitud (modo demo)", "status-advance", { disabled: statusUI.busy })}`
        : badge("¡Tu préstamo fue desembolsado!", "success");

    return `
      <div class="screen-scroll">
        ${screenHeader("Estado de solicitud", true)}
        <div class="px-5 pb-6">
          ${card(
            `<div class="flex justify-between items-start mb-1">
              <p class="text-faint text-xs">Solicitud</p>
              ${badge(app.estado === "activo" ? "Aprobada" : "En evaluación", app.estado === "activo" ? "success" : "pending")}
            </div>
            <p class="text-teal" style="font-weight:700;font-size:0.875rem;margin-bottom:0.25rem;">#${esc(app.id)}</p>
            <p class="text-faint text-xs">${esc(app.fechaSolicitud)}</p>`,
            "mb-5"
          )}
          <p class="row-value" style="color:#fff;margin-bottom:0.75rem;">Seguimiento</p>
          ${milestonesHtml}
          <div style="margin-top:0.5rem;">${bottom}</div>
        </div>
      </div>`;
  }

  function screenLoanDetail(loan) {
    const proximo = loan.pagos.find((p) => p.estado === "Pendiente");
    return `
      <div class="screen-scroll">
        ${screenHeader("Mi préstamo", true)}
        <div class="px-5 pb-6">
          ${card(
            `<div class="flex justify-between items-start mb-3">
              <p class="row-value" style="color:#fff;">Préstamo activo</p>
              ${badge("Activo", "success")}
            </div>
            ${row("Monto del préstamo", fmtMoney(loan.monto))}
            ${row("Fecha de aprobación", esc(loan.fechaAprobacion))}
            ${row("Plazo", `${loan.meses} meses`)}
            ${row("Tasa de interés anual", `${loan.tasa}%`)}
            <div class="divider"></div>
            ${row("Total a pagar", fmtMoney(loan.total), true)}`,
            "mb-4"
          )}
          ${
            proximo
              ? card(
                  `<p class="row-value" style="color:#fff;margin-bottom:0.5rem;">Próximo pago</p>
                  <div class="flex justify-between">
                    <div><p class="text-faint text-xs">Fecha</p><p class="row-value">${esc(proximo.fecha)}</p></div>
                    <div class="text-right"><p class="text-faint text-xs">Monto</p><p class="row-value">${fmtMoney(proximo.cuota)}</p></div>
                  </div>`,
                  "mb-4"
                )
              : ""
          }
          ${primaryButton("Ver calendario de pagos", "push", { attrs: 'data-screen="calendar"' })}
        </div>
      </div>`;
  }

  function screenCalendar(loan, insideTab) {
    if (!loan) {
      return `
        <div class="screen">
          ${screenHeader("Calendario de cuotas", !insideTab)}
          <div class="empty-state">
            <span style="color:var(--slate-700);margin-bottom:0.75rem;">${Icon("wallet", { size: 36 })}</span>
            <p class="text-muted text-sm">Aún no tienes un préstamo activo con pagos programados.</p>
          </div>
        </div>`;
    }
    const nextPendingNum = (loan.pagos.find((p) => p.estado === "Pendiente") || {}).num;
    const rows = loan.pagos
      .map((p) => {
        let right;
        if (p.estado === "Pagado") right = badge("Pagado", "success");
        else if (p.num === nextPendingNum)
          right = `<button type="button" class="pay-btn" data-action="cal-pay" data-num="${p.num}" ${calUI.payingNum === p.num ? "disabled" : ""}>${
            calUI.payingNum === p.num ? "Pagando..." : "Pagar"
          }</button>`;
        else right = badge("Pendiente", "pending");
        return `<div class="pay-row">
          <div class="flex items-center gap-3">
            <span class="pay-num">${p.num}</span>
            <div><p class="text-sm row-value" style="font-weight:500;">${esc(p.fecha)}</p><p class="text-faint text-xs">${fmtMoney(p.cuota)}</p></div>
          </div>
          ${right}
        </div>`;
      })
      .join("");

    return `
      <div class="screen-scroll">
        ${screenHeader("Calendario de cuotas", !insideTab)}
        <div class="px-5 pb-6">
          ${card(
            `<div class="flex justify-between" style="width:100%;">
              <div><p class="text-faint text-xs">Total del préstamo</p><p class="row-value" style="color:#fff;">${fmtMoney(loan.monto)}</p></div>
              <div class="text-right"><p class="text-faint text-xs">Total a pagar</p><p class="row-value" style="color:#fff;">${fmtMoney(loan.total)}</p></div>
            </div>`,
            "mb-4"
          )}
          <div class="space-y-2">${rows}</div>
          ${calUI.error ? `<p class="form-error" style="margin-top:0.75rem;">${esc(calUI.error)}</p>` : ""}
          <p class="hint-tiny" style="margin-top:0.75rem;">Los pagos se consideran realizados al final del día seleccionado.</p>
        </div>
      </div>`;
  }

  function screenHistory() {
    const items = state.history;
    return `
      <div class="screen-scroll">
        ${screenHeader("Historial de préstamos", true)}
        <div class="px-5 pb-6 space-y-3">
          ${items.length === 0 ? `<p class="text-faint text-sm text-center" style="margin-top:2.5rem;">Aún no tienes préstamos completados.</p>` : ""}
          ${items
            .map(
              (h) => `
            ${card(
              `<div class="flex justify-between items-start mb-2">
                <p class="text-teal" style="font-weight:700;font-size:0.875rem;">Préstamo #${esc(h.id)}</p>
                ${badge("Pagado", "success")}
              </div>
              ${row("Monto", fmtMoney(h.monto))}
              ${row("Total pagado", fmtMoney(h.totalPagado))}
              ${row("Fecha", esc(h.fecha))}`
            )}`
            )
            .join("")}
        </div>
      </div>`;
  }

  function screenProfile() {
    const user = state.user;
    const items = [
      { icon: "user", label: "Información personal" },
      { icon: "file-text", label: "Datos de contacto" },
      { icon: "shield", label: "Cambiar contraseña" },
      { icon: "check-circle-2", label: "Verificación de identidad", tag: "Verificado" },
    ];
    return `
      <div class="screen-scroll px-5 pt-5 pb-6">
        <h1 class="title-lg mb-5">Mi perfil</h1>
        ${card(
          `<div class="card-row">
            <div class="avatar-lg">${esc(user.nombres[0])}</div>
            <div><p class="row-value" style="color:#fff;">${esc(user.nombres)}</p><p class="text-faint text-xs">${esc(user.correo)}</p></div>
          </div>`,
          "mb-5"
        )}
        <div class="list-card mb-5">
          ${items
            .map(
              (it) => `
            <button type="button" class="list-row">
              <div class="list-row-left"><span class="ic">${Icon(it.icon, { size: 17 })}</span>${esc(it.label)}</div>
              <div class="list-row-right">${it.tag ? badge(it.tag, "success") : ""}${Icon("chevron-right", { size: 16, className: "text-faint" })}</div>
            </button>`
            )
            .join("")}
        </div>
        <div class="list-card mb-5">
          <button type="button" class="list-row" data-action="push" data-screen="settings">
            <div class="list-row-left"><span class="ic">${Icon("help-circle", { size: 17 })}</span>Configuración</div>
            ${Icon("chevron-right", { size: 16, className: "text-faint" })}
          </button>
        </div>
        <button type="button" class="logout-row" data-action="logout">
          ${Icon("log-out", { size: 17 })} Cerrar sesión
        </button>
      </div>`;
  }

  function screenSettings() {
    const items = ["Notificaciones", "Seguridad", "Privacidad", "Ayuda y soporte", "Acerca de Juranyi"];
    return `
      <div class="screen-scroll">
        ${screenHeader("Configuración", true)}
        <div class="px-5 pb-6">
          <div class="list-card">
            ${items
              .map(
                (it) => `<button type="button" class="list-row">${esc(it)} ${Icon("chevron-right", { size: 16, className: "text-faint" })}</button>`
              )
              .join("")}
          </div>
        </div>
      </div>`;
  }

  function screenNotifications() {
    const items = state.notifications;
    return `
      <div class="screen-scroll px-5 pt-5 pb-6">
        <h1 class="title-lg mb-4">Notificaciones</h1>
        <div class="space-y-2 mb-3">
          ${items.length === 0 ? `<p class="text-faint text-sm text-center" style="margin-top:2.5rem;">No tienes notificaciones todavía.</p>` : ""}
          ${items
            .map(
              (n) => `
            <div class="notif-row">
              <div class="notif-dot ${n.read ? "" : "unread"}"></div>
              <div class="flex-1">
                <p class="row-value" style="color:#e2e8f0;">${esc(n.title)}</p>
                <p class="text-faint text-xs">${esc(n.subtitle)}</p>
                <p class="hint-tiny" style="margin-top:0.25rem;">${esc(n.time)}</p>
              </div>
            </div>`
            )
            .join("")}
        </div>
        ${items.some((n) => !n.read) ? `<button type="button" class="link-btn text-xs" data-action="notif-mark-all">Marcar todas como leídas</button>` : ""}
      </div>`;
  }

  function screenLoansTab() {
    const loan = activeLoan();
    const pending = pendingApp();
    let content;
    if (loan) {
      content = card(
        `<div class="flex justify-between items-start mb-2">
          <p class="text-faint text-xs">Préstamo activo</p>
          ${badge("Activo", "success")}
        </div>
        <p class="title-lg mb-3">${fmtMoney(loan.monto)}</p>
        ${primaryButton("Ver detalle", "push", { attrs: 'data-screen="loanDetail"' })}`,
        "mb-3"
      );
    } else if (pending) {
      content = card(
        `<div class="flex justify-between items-start mb-2">
          <p class="text-faint text-xs">Solicitud</p>
          ${badge("En evaluación", "pending")}
        </div>
        <p class="title-md mb-3">#${esc(pending.id)}</p>
        ${primaryButton("Ver estado", "push", { attrs: `data-screen="status" data-app-id="${esc(pending.id)}"` })}`,
        "mb-3"
      );
    } else {
      content = card(
        `<p class="row-value" style="color:#fff;">No tienes préstamos activos</p>
        <p class="text-faint text-xs mb-4" style="margin-top:0.25rem;">Simula uno nuevo y descubre tu cuota.</p>
        ${primaryButton("Simular préstamo", "push", { attrs: 'data-screen="simulator"' })}`,
        "mb-3"
      );
    }
    return `
      <div class="screen-scroll px-5 pt-5 pb-6">
        <h1 class="title-lg mb-4">Préstamos</h1>
        ${content}
        <button type="button" class="pay-row w-full" style="text-align:left;" data-action="push" data-screen="history">
          <div class="flex items-center gap-3 text-sm" style="color:#e2e8f0;">${Icon("clock", { size: 17, className: "text-teal" })} Historial de préstamos</div>
          ${Icon("chevron-right", { size: 16, className: "text-faint" })}
        </button>
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Bottom nav                                                       */
  /* -------------------------------------------------------------- */

  function bottomNav() {
    const tabs = [
      { key: "home", label: "Inicio", icon: "home" },
      { key: "loans", label: "Préstamos", icon: "credit-card" },
      { key: "payments", label: "Pagos", icon: "calendar" },
      { key: "notifications", label: "Notificaciones", icon: "bell", badge: unreadCount() },
      { key: "profile", label: "Perfil", icon: "user" },
    ];
    return `
      <div class="bottom-nav">
        ${tabs
          .map(
            (t) => `
          <button type="button" class="nav-btn ${state.tab === t.key ? "active" : ""}" data-action="set-tab" data-tab="${t.key}">
            <div class="nav-icon-wrap">
              ${Icon(t.icon, { size: 19 })}
              ${t.badge ? `<span class="nav-badge">${t.badge}</span>` : ""}
            </div>
            <span class="nav-label">${t.label}</span>
          </button>`
          )
          .join("")}
      </div>`;
  }

  /* -------------------------------------------------------------- */
  /*  Root render                                                      */
  /* -------------------------------------------------------------- */

  function render() {
    let body = "";
    let showNav = false;

    if (state.appState === "splash") {
      body = screenSplash();
    } else if (state.appState === "auth") {
      body = screenAuth();
    } else {
      const top = state.stack[state.stack.length - 1];
      if (top) {
        switch (top.screen) {
          case "simulator":
            body = screenSimulator();
            break;
          case "request":
            body = screenRequest(top.props.loanTerms);
            break;
          case "success":
            body = screenSuccess(top.props.appId);
            break;
          case "status": {
            const app = state.applications.find((a) => a.id === top.props.appId);
            body = app ? screenStatus(app) : `<div class="px-5 pt-5 text-muted text-sm">Cargando solicitud…</div>`;
            break;
          }
          case "loanDetail":
            body = screenLoanDetail(activeLoan());
            break;
          case "calendar":
            body = screenCalendar(activeLoan(), false);
            break;
          case "history":
            body = screenHistory();
            break;
          case "settings":
            body = screenSettings();
            break;
          default:
            body = "";
        }
      } else {
        showNav = true;
        if (state.tab === "home") body = screenHome();
        else if (state.tab === "loans") body = screenLoansTab();
        else if (state.tab === "payments") body = screenCalendar(activeLoan(), true);
        else if (state.tab === "notifications") body = screenNotifications();
        else if (state.tab === "profile") body = screenProfile();
      }
    }

    const globalErrorHtml =
      state.globalError && state.appState === "main"
        ? `<div class="global-error"><p>${esc(state.globalError)}</p><button type="button" data-action="dismiss-global-error">${Icon("x", { size: 13 })}</button></div>`
        : "";

    const root = document.getElementById("app");
    root.innerHTML = `
      <div class="app-shell">
        <div class="phone">
          ${globalErrorHtml}
          <div class="phone-body">${body}</div>
          ${showNav ? bottomNav() : ""}
        </div>
      </div>`;

    afterRender();
  }

  /* -------------------------------------------------------------- */
  /*  Post-render wiring for things that need "live" DOM updates       */
  /*  (range slider) without doing a full re-render on every input.    */
  /* -------------------------------------------------------------- */

  function afterRender() {
    const slider = document.getElementById("sim-monto-slider");
    if (slider) {
      slider.addEventListener("input", () => {
        simUI.monto = Number(slider.value);
        const label = document.getElementById("sim-monto-label");
        const results = document.getElementById("sim-results");
        if (label) label.textContent = fmtMoney(simUI.monto);
        if (results) results.innerHTML = simResultsRows(simUI.monto, simUI.meses, simulateLoan(simUI.monto, simUI.meses));
      });
    }
  }

  /* -------------------------------------------------------------- */
  /*  Snapshot helpers: read uncontrolled inputs back into state       */
  /*  before we re-render (so nothing typed gets lost).                */
  /* -------------------------------------------------------------- */

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }
  function checked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function snapshotAuthServerUrl() {
    const el = document.getElementById("server-url-input");
    if (el && el.value) state.apiUrl = el.value;
  }

  /* -------------------------------------------------------------- */
  /*  Event delegation                                                 */
  /* -------------------------------------------------------------- */

  const appEl = document.getElementById("app");

  appEl.addEventListener("submit", async (e) => {
    const form = e.target.closest("form[data-form]");
    if (!form) return;
    e.preventDefault();
    const kind = form.getAttribute("data-form");

    if (kind === "register") {
      snapshotAuthServerUrl();
      const f = authUI.regForm;
      f.nombres = val("reg-nombres");
      f.cedula = val("reg-cedula");
      f.telefono = val("reg-telefono");
      f.correo = val("reg-correo");
      f.password = val("reg-password");
      f.accepted = checked("reg-accepted");

      if (!f.nombres || !f.cedula || !f.correo || !f.password) {
        authUI.error = "Completa todos los campos.";
        render();
        return;
      }
      if (!f.accepted) {
        authUI.error = "Debes aceptar los Términos y la Política de Privacidad.";
        render();
        return;
      }
      authUI.error = "";
      authUI.busy = true;
      render();
      try {
        await handleRegister({
          nombres: f.nombres,
          cedula: f.cedula,
          telefono: f.telefono || "(809) 000-0000",
          correo: f.correo,
          password: f.password,
        });
      } catch (err) {
        authUI.error = err.message;
      } finally {
        authUI.busy = false;
        if (state.appState !== "main") render();
      }
    }

    if (kind === "login") {
      snapshotAuthServerUrl();
      const f = authUI.loginForm;
      f.correo = val("login-correo");
      f.password = val("login-password");

      if (!f.correo || !f.password) {
        authUI.error = "Ingresa tu correo y contraseña.";
        render();
        return;
      }
      authUI.error = "";
      authUI.busy = true;
      render();
      try {
        await handleLogin(f.correo, f.password);
      } catch (err) {
        authUI.error = err.message;
      } finally {
        authUI.busy = false;
        if (state.appState !== "main") render();
      }
    }
  });

  appEl.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const action = t.getAttribute("data-action");

    switch (action) {
      case "start":
        state.appState = "auth";
        render();
        break;

      case "auth-switch":
        snapshotAuthServerUrl();
        authUI.error = "";
        state.authMode = t.getAttribute("data-mode");
        render();
        break;

      case "auth-toggle-pass":
        authUI.showPass = !authUI.showPass;
        render();
        break;

      case "auth-toggle-servercfg": {
        // Guarda lo escrito en los formularios antes de re-renderizar.
        if (state.authMode === "register") {
          authUI.regForm.nombres = val("reg-nombres");
          authUI.regForm.cedula = val("reg-cedula");
          authUI.regForm.telefono = val("reg-telefono");
          authUI.regForm.correo = val("reg-correo");
          authUI.regForm.password = val("reg-password");
          authUI.regForm.accepted = checked("reg-accepted");
        } else {
          authUI.loginForm.correo = val("login-correo");
          authUI.loginForm.password = val("login-password");
        }
        authUI.showServerCfg = !authUI.showServerCfg;
        render();
        break;
      }

      case "dismiss-global-error":
        state.globalError = "";
        render();
        break;

      case "push":
        push(t.getAttribute("data-screen"), { appId: t.getAttribute("data-app-id") });
        break;

      case "pop":
        pop();
        break;

      case "sim-set-meses":
        simUI.meses = Number(t.getAttribute("data-meses"));
        render();
        break;

      case "sim-request":
        startRequest(Object.assign({ monto: simUI.monto, meses: simUI.meses }, simulateLoan(simUI.monto, simUI.meses)));
        break;

      case "req-continue-1": {
        const f = reqUI.form;
        f.nombres = val("req-nombres");
        f.cedula = val("req-cedula");
        f.telefono = val("req-telefono");
        f.direccion = val("req-direccion");
        f.fechaNacimiento = val("req-fecha");
        const sel = document.getElementById("req-estadocivil");
        f.estadoCivil = sel ? sel.value : "";
        reqUI.step = 2;
        render();
        break;
      }

      case "req-continue-2":
        reqUI.step = 3;
        render();
        break;

      case "req-submit": {
        reqUI.error = "";
        reqUI.busy = true;
        render();
        try {
          await submitApplication(reqUI.form);
        } catch (err) {
          reqUI.error = err.message;
        } finally {
          reqUI.busy = false;
          render();
        }
        break;
      }

      case "success-goto-home":
        reqUI.form = null;
        popToTab("home");
        break;

      case "success-goto-status":
        state.stack = [{ screen: "status", props: { appId: t.getAttribute("data-app-id") } }];
        render();
        break;

      case "status-advance": {
        const top = state.stack[state.stack.length - 1];
        const appId = top.props.appId;
        statusUI.error = "";
        statusUI.busy = true;
        render();
        try {
          await advanceApplication(appId);
        } catch (err) {
          statusUI.error = err.message;
        } finally {
          statusUI.busy = false;
          render();
        }
        break;
      }

      case "cal-pay": {
        const loan = activeLoan();
        const num = Number(t.getAttribute("data-num"));
        calUI.error = "";
        calUI.payingNum = num;
        render();
        try {
          await payInstallment(loan.id, num);
        } catch (err) {
          calUI.error = err.message;
        } finally {
          calUI.payingNum = null;
          render();
        }
        break;
      }

      case "notif-mark-all":
        markAllRead();
        break;

      case "set-tab":
        state.stack = [];
        state.tab = t.getAttribute("data-tab");
        render();
        break;

      case "logout":
        handleLogout();
        break;

      default:
        break;
    }
  });

  /* -------------------------------------------------------------- */
  /*  Boot                                                             */
  /* -------------------------------------------------------------- */

  render();
})();
