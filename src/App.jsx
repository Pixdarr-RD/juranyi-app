import React, { useState, useMemo } from "react";
import {
  Home, CreditCard, Calendar, Bell, User, ArrowLeft, ChevronRight,
  Check, CheckCircle2, Circle, Eye, EyeOff, RefreshCw, LogOut, Shield,
  HelpCircle, FileText, Wallet, TrendingUp, Clock, Info, X, Sparkles,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  Backend connection                                                     */
/* ---------------------------------------------------------------------- */

// En producción, define VITE_API_URL en las variables de entorno del
// hosting (Render/Railway/Vercel) apuntando a la URL pública de tu backend,
// por ejemplo: VITE_API_URL=https://juranyi-backend.onrender.com/api
// También se puede ajustar desde la pantalla de inicio de sesión ("URL del servidor").
const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function apiFetch(apiUrl, token, path, opts = {}) {
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method: opts.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (networkErr) {
    throw new Error("No se pudo conectar al servidor. Verifica la URL del backend y que esté corriendo.");
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* respuesta vacía */ }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */

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

// nota: la generación de folio, calendario de pagos e hitos de la solicitud
// ahora vive en el backend (utils/loan.js) — aquí solo se necesita la lista
// de hitos para dibujar la línea de tiempo del estado de la solicitud.
const MILESTONES = [
  { key: "recibida", label: "Solicitud recibida" },
  { key: "evaluacion", label: "En evaluación", sub: "Estamos verificando tu información" },
  { key: "aprobacion", label: "Aprobación" },
  { key: "desembolso", label: "Desembolso" },
];

/* ---------------------------------------------------------------------- */
/*  Small UI primitives                                                    */
/* ---------------------------------------------------------------------- */

function Logo({ size = "md" }) {
  const dims = size === "lg" ? "text-6xl" : size === "sm" ? "text-xl" : "text-3xl";
  return (
    <span
      className={`${dims} font-black bg-gradient-to-br from-teal-300 to-emerald-500 bg-clip-text text-transparent`}
      style={{ fontFamily: "Georgia, serif" }}
    >
      J
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-3.5 rounded-xl font-semibold text-slate-950 transition active:scale-[0.98] ${
        disabled
          ? "bg-slate-700 text-slate-400 cursor-not-allowed"
          : "bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-300 hover:to-emerald-400"
      }`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3.5 rounded-xl font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-750 active:scale-[0.98] transition"
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-xs font-medium text-slate-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition"
    />
  );
}

function Badge({ children, tone = "success" }) {
  const tones = {
    success: "bg-emerald-500/15 text-emerald-400",
    pending: "bg-amber-500/15 text-amber-400",
    info: "bg-sky-500/15 text-sky-400",
    danger: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  );
}

function Header({ title, onBack, right }) {
  return (
    <div className="flex items-center justify-between px-5 pt-5 pb-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-slate-300 hover:text-white">
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Screens                                                                 */
/* ---------------------------------------------------------------------- */

function SplashScreen({ onStart }) {
  return (
    <div className="h-full flex flex-col justify-between px-8 py-14 bg-gradient-to-b from-slate-950 to-slate-900">
      <div />
      <div className="text-center">
        <div className="mb-4"><Logo size="lg" /></div>
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">JURANYI</h1>
        <p className="text-slate-400 text-sm">Préstamos que impulsan tus sueños</p>
      </div>
      <div className="space-y-3">
        <PrimaryButton onClick={onStart}>Comenzar</PrimaryButton>
        <p className="text-center text-xs text-slate-500">🇩🇴 República Dominicana</p>
      </div>
    </div>
  );
}

function AuthScreen({ mode, setMode, onLogin, onRegister, apiUrl, setApiUrl }) {
  const [showPass, setShowPass] = useState(false);
  const [showServerCfg, setShowServerCfg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    nombres: "", cedula: "", telefono: "", correo: "", password: "", accepted: false,
  });
  const [loginForm, setLoginForm] = useState({ correo: "", password: "" });
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submitRegister(e) {
    e.preventDefault();
    if (!form.nombres || !form.cedula || !form.correo || !form.password) {
      setError("Completa todos los campos.");
      return;
    }
    if (!form.accepted) {
      setError("Debes aceptar los Términos y la Política de Privacidad.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onRegister({
        nombres: form.nombres,
        cedula: form.cedula,
        telefono: form.telefono || "(809) 000-0000",
        correo: form.correo,
        password: form.password,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(e) {
    e.preventDefault();
    if (!loginForm.correo || !loginForm.password) {
      setError("Ingresa tu correo y contraseña.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onLogin(loginForm.correo, loginForm.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const serverConfig = (
    <div className="mt-5">
      <button type="button" onClick={() => setShowServerCfg((s) => !s)} className="text-[11px] text-slate-600 hover:text-slate-400">
        ⚙️ URL del servidor
      </button>
      {showServerCfg && (
        <div className="mt-2">
          <TextInput value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder={DEFAULT_API_URL} />
          <p className="text-[10px] text-slate-600 mt-1">Apunta esto a donde esté corriendo tu backend de Juranyi.</p>
        </div>
      )}
    </div>
  );

  if (mode === "register") {
    return (
      <div className="h-full overflow-y-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-white mb-1">Crear cuenta</h1>
        <p className="text-slate-400 text-sm mb-6">Completa tus datos para comenzar</p>
        <form onSubmit={submitRegister}>
          <Field label="Nombres">
            <TextInput placeholder="Juan Pérez" value={form.nombres} onChange={(e) => update("nombres", e.target.value)} />
          </Field>
          <Field label="Cédula">
            <TextInput placeholder="001-1234567-8" value={form.cedula} onChange={(e) => update("cedula", e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <TextInput placeholder="(809) 123-4567" value={form.telefono} onChange={(e) => update("telefono", e.target.value)} />
          </Field>
          <Field label="Correo electrónico">
            <TextInput type="email" placeholder="juanperez@gmail.com" value={form.correo} onChange={(e) => update("correo", e.target.value)} />
          </Field>
          <Field label="Contraseña">
            <div className="relative">
              <TextInput type={showPass ? "text" : "password"} placeholder="••••••••••" value={form.password} onChange={(e) => update("password", e.target.value)} />
              <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-3 top-2.5 text-slate-500">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <label className="flex items-start gap-2 mb-5 text-xs text-slate-400">
            <input type="checkbox" checked={form.accepted} onChange={(e) => update("accepted", e.target.checked)} className="mt-0.5" />
            <span>Acepto los <span className="text-teal-400">Términos y Condiciones</span> y la <span className="text-teal-400">Política de Privacidad</span></span>
          </label>
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
          <PrimaryButton type="submit" disabled={busy}>{busy ? "Creando cuenta..." : "Crear cuenta"}</PrimaryButton>
          <p className="text-center text-sm text-slate-400 mt-4">
            ¿Ya tienes cuenta?{" "}
            <button type="button" onClick={() => { setError(""); setMode("login"); }} className="text-teal-400 font-semibold">
              Inicia sesión
            </button>
          </p>
          {serverConfig}
        </form>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center px-6 py-8">
      <div className="text-center mb-8">
        <Logo />
        <h1 className="text-2xl font-bold text-white mt-3">¡Bienvenido de nuevo!</h1>
        <p className="text-slate-400 text-sm mt-1">Inicia sesión para continuar</p>
      </div>
      <form onSubmit={submitLogin}>
        <Field label="Correo electrónico o teléfono">
          <TextInput placeholder="juanperez@gmail.com" value={loginForm.correo} onChange={(e) => setLoginForm((f) => ({ ...f, correo: e.target.value }))} />
        </Field>
        <Field label="Contraseña">
          <div className="relative">
            <TextInput type={showPass ? "text" : "password"} placeholder="••••••••••" value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))} />
            <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-3 top-2.5 text-slate-500">
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <p className="text-right text-xs text-teal-400 mb-5">¿Olvidaste tu contraseña?</p>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <PrimaryButton type="submit" disabled={busy}>{busy ? "Ingresando..." : "Iniciar sesión"}</PrimaryButton>
        <p className="text-center text-sm text-slate-400 mt-4">
          ¿No tienes cuenta?{" "}
          <button type="button" onClick={() => { setError(""); setMode("register"); }} className="text-teal-400 font-semibold">
            Regístrate
          </button>
        </p>
        {serverConfig}
      </form>
    </div>
  );
}

function HomeScreen({ user, activeLoan, pendingApp, push }) {
  return (
    <div className="h-full overflow-y-auto px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white">¡Hola, {user.nombres.split(" ")[0]}! 👋</h1>
          <p className="text-slate-400 text-xs mt-0.5">Bienvenido a Juranyi</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-teal-400 font-bold">
          {user.nombres[0]}
        </div>
      </div>

      {activeLoan ? (
        <Card className="mb-5 bg-gradient-to-br from-slate-900 to-slate-800">
          <div className="flex justify-between items-start mb-1">
            <p className="text-slate-400 text-xs">Préstamo actual</p>
            <Badge tone="success">Activo</Badge>
          </div>
          <p className="text-2xl font-bold text-white mb-3">{fmtMoney(activeLoan.monto)}</p>
          <div className="flex justify-between text-xs mb-4">
            <div>
              <p className="text-slate-500">Próximo pago</p>
              <p className="text-slate-200 font-medium">{activeLoan.pagos.find(p => p.estado === "Pendiente")?.fecha ?? "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Monto a pagar</p>
              <p className="text-slate-200 font-medium">{fmtMoney(activeLoan.cuota)}</p>
            </div>
          </div>
          <PrimaryButton onClick={() => push("loanDetail")}>Ver préstamo</PrimaryButton>
        </Card>
      ) : pendingApp ? (
        <Card className="mb-5">
          <div className="flex justify-between items-start mb-1">
            <p className="text-slate-400 text-xs">Solicitud en proceso</p>
            <Badge tone="pending">En evaluación</Badge>
          </div>
          <p className="text-xl font-bold text-white mb-1">{fmtMoney(pendingApp.monto)}</p>
          <p className="text-slate-500 text-xs mb-4">#{pendingApp.id}</p>
          <PrimaryButton onClick={() => push("status", { appId: pendingApp.id })}>Ver estado</PrimaryButton>
        </Card>
      ) : (
        <Card className="mb-5">
          <Sparkles className="text-teal-400 mb-2" size={22} />
          <p className="text-white font-semibold mb-1">Empieza tu solicitud</p>
          <p className="text-slate-400 text-xs mb-4">Simula tu préstamo y descubre tu cuota ideal en segundos.</p>
          <PrimaryButton onClick={() => push("simulator")}>Simular préstamo</PrimaryButton>
        </Card>
      )}

      <p className="text-slate-400 text-xs font-semibold mb-2.5">Accesos rápidos</p>
      <div className="grid grid-cols-2 gap-3">
        <QuickAccess icon={<TrendingUp size={18} />} label="Simular préstamo" onClick={() => push("simulator")} />
        <QuickAccess icon={<FileText size={18} />} label="Solicitar préstamo" onClick={() => (pendingApp ? push("status", { appId: pendingApp.id }) : push("simulator"))} />
        <QuickAccess icon={<Clock size={18} />} label="Historial" onClick={() => push("history")} />
        <QuickAccess icon={<Wallet size={18} />} label="Mis pagos" onClick={() => (activeLoan ? push("calendar") : push("simulator"))} />
      </div>
    </div>
  );
}

function QuickAccess({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-left hover:border-slate-700 transition">
      <div className="text-teal-400 mb-2">{icon}</div>
      <p className="text-sm text-slate-200 font-medium">{label}</p>
    </button>
  );
}

function SimulatorScreen({ back, onRequest }) {
  const [monto, setMonto] = useState(20000);
  const [meses, setMeses] = useState(6);
  const sim = useMemo(() => simulateLoan(monto, meses), [monto, meses]);

  return (
    <div className="h-full overflow-y-auto">
      <Header title="Simular préstamo" onBack={back} />
      <div className="px-5">
        <p className="text-slate-400 text-xs mb-2">¿Cuánto dinero necesitas?</p>
        <p className="text-3xl font-bold text-white mb-3">{fmtMoney(monto)}</p>
        <input
          type="range" min={1000} max={100000} step={500} value={monto}
          onChange={(e) => setMonto(Number(e.target.value))}
          className="w-full accent-teal-400 mb-1"
        />
        <div className="flex justify-between text-xs text-slate-500 mb-6">
          <span>RD$ 1,000</span><span>RD$ 100,000</span>
        </div>

        <p className="text-slate-400 text-xs mb-2.5">¿En cuántos meses?</p>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[3, 6, 12, 18].map((m) => (
            <button
              key={m}
              onClick={() => setMeses(m)}
              className={`py-2 rounded-lg text-sm font-semibold border transition ${
                meses === m ? "bg-gradient-to-r from-teal-400 to-emerald-500 text-slate-950 border-transparent" : "bg-slate-800 border-slate-700 text-slate-300"
              }`}
            >
              {m} meses
            </button>
          ))}
        </div>

        <Card className="mb-4">
          <p className="text-sm font-semibold text-white mb-3">Tu simulación</p>
          <Row label="Monto solicitado" value={fmtMoney(monto)} />
          <Row label={`Interés (${meses} meses)`} value={fmtMoney(sim.interes)} />
          <Row label="Total a pagar" value={fmtMoney(sim.total)} />
          <div className="border-t border-slate-800 my-2" />
          <Row label="Cuota mensual" value={fmtMoney(sim.cuota)} highlight />
          <p className="text-[10px] text-slate-500 mt-2">* Tasa de interés anual {sim.tasa}%</p>
        </Card>

        <div className="pb-6">
          <PrimaryButton onClick={() => onRequest({ monto, meses, ...sim })}>Solicitar este préstamo</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-teal-400" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}

function RequestScreen({ back, user, loanTerms, onSubmit }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    nombres: user.nombres, cedula: user.cedula, telefono: user.telefono,
    direccion: user.direccion, fechaNacimiento: user.fechaNacimiento, estadoCivil: user.estadoCivil,
  });

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function handleFinalSubmit() {
    setError("");
    setBusy(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Información", "Verificación", "Confirmación"];

  return (
    <div className="h-full overflow-y-auto">
      <Header title="Solicitud de préstamo" onBack={back} />
      <div className="px-5 flex items-center gap-2 mb-5">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                step > i + 1 ? "bg-emerald-500 text-slate-950" : step === i + 1 ? "bg-gradient-to-r from-teal-400 to-emerald-500 text-slate-950" : "bg-slate-800 text-slate-500"
              }`}>
                {step > i + 1 ? <Check size={13} /> : i + 1}
              </div>
              <span className="text-[10px] text-slate-500">{s}</span>
            </div>
            {i < steps.length - 1 && <div className="flex-1 h-px bg-slate-800 mb-4" />}
          </React.Fragment>
        ))}
      </div>

      <div className="px-5 pb-6">
        {step === 1 && (
          <>
            <p className="text-sm font-semibold text-white mb-3">Información personal</p>
            <Field label="Nombres completos"><TextInput value={form.nombres} onChange={(e) => update("nombres", e.target.value)} /></Field>
            <Field label="Cédula"><TextInput value={form.cedula} onChange={(e) => update("cedula", e.target.value)} /></Field>
            <Field label="Teléfono"><TextInput value={form.telefono} onChange={(e) => update("telefono", e.target.value)} /></Field>
            <Field label="Dirección"><TextInput placeholder="Calle Principal #123, Santo Domingo" value={form.direccion} onChange={(e) => update("direccion", e.target.value)} /></Field>
            <Field label="Fecha de nacimiento"><TextInput type="date" value={form.fechaNacimiento} onChange={(e) => update("fechaNacimiento", e.target.value)} /></Field>
            <Field label="Estado civil">
              <select value={form.estadoCivil} onChange={(e) => update("estadoCivil", e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white outline-none focus:border-teal-400">
                <option value="">Selecciona</option>
                <option>Soltero</option><option>Casado</option><option>Unión libre</option><option>Divorciado</option>
              </select>
            </Field>
            <PrimaryButton onClick={() => setStep(2)}>Continuar</PrimaryButton>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm font-semibold text-white mb-3">Verificación de identidad</p>
            <Card className="mb-5">
              <div className="flex items-start gap-3">
                <Shield className="text-teal-400 shrink-0 mt-0.5" size={18} />
                <p className="text-xs text-slate-400">Confirmamos que tus datos coinciden con tu cédula. No necesitas subir documentos adicionales para esta simulación.</p>
              </div>
            </Card>
            <Card className="mb-5">
              <Row label="Nombres" value={form.nombres} />
              <Row label="Cédula" value={form.cedula} />
              <Row label="Teléfono" value={form.telefono} />
            </Card>
            <PrimaryButton onClick={() => setStep(3)}>Continuar</PrimaryButton>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm font-semibold text-white mb-3">Confirmación</p>
            <Card className="mb-5">
              <Row label="Monto solicitado" value={fmtMoney(loanTerms.monto)} />
              <Row label="Plazo" value={`${loanTerms.meses} meses`} />
              <Row label="Tasa de interés anual" value={`${loanTerms.tasa}%`} />
              <div className="border-t border-slate-800 my-2" />
              <Row label="Total a pagar" value={fmtMoney(loanTerms.total)} highlight />
              <Row label="Cuota mensual" value={fmtMoney(loanTerms.cuota)} />
            </Card>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <PrimaryButton onClick={handleFinalSubmit} disabled={busy}>{busy ? "Enviando..." : "Continuar"}</PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessScreen({ appId, goHome, goStatus }) {
  return (
    <div className="h-full flex flex-col px-6 py-10 items-center text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mb-6">
        <CheckCircle2 className="text-emerald-400" size={40} />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">¡Solicitud enviada!</h1>
      <p className="text-slate-400 text-sm mb-6">Hemos recibido tu solicitud de préstamo correctamente.</p>
      <Card className="w-full mb-8">
        <p className="text-xs text-slate-500 mb-1">Número de solicitud</p>
        <p className="text-teal-400 font-bold">#{appId}</p>
      </Card>
      <div className="w-full mt-auto space-y-3">
        <PrimaryButton onClick={goStatus}>Ver estado</PrimaryButton>
        <SecondaryButton onClick={goHome}>Ir al inicio</SecondaryButton>
      </div>
    </div>
  );
}

function StatusScreen({ app, back, onAdvance }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const idx = app.milestoneIndex;

  async function handleAdvance() {
    setError("");
    setBusy(true);
    try {
      await onAdvance();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <Header title="Estado de solicitud" onBack={back} />
      <div className="px-5 pb-6">
        <Card className="mb-5">
          <div className="flex justify-between items-start mb-1">
            <p className="text-slate-500 text-xs">Solicitud</p>
            <Badge tone={app.estado === "activo" ? "success" : "pending"}>
              {app.estado === "activo" ? "Aprobada" : "En evaluación"}
            </Badge>
          </div>
          <p className="text-teal-400 font-bold text-sm mb-1">#{app.id}</p>
          <p className="text-slate-500 text-xs">{app.fechaSolicitud}</p>
        </Card>

        <p className="text-sm font-semibold text-white mb-3">Seguimiento</p>
        <div className="space-y-0">
          {MILESTONES.map((m, i) => {
            const done = i < idx || app.estado === "activo" && i <= idx;
            const current = i === idx && app.estado !== "activo";
            return (
              <div key={m.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    done ? "bg-emerald-500 text-slate-950" : current ? "bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-600"
                  }`}>
                    {done ? <Check size={13} /> : <Circle size={8} fill="currentColor" />}
                  </div>
                  {i < MILESTONES.length - 1 && <div className={`w-px flex-1 min-h-[28px] ${done ? "bg-emerald-500" : "bg-slate-800"}`} />}
                </div>
                <div className="pb-6">
                  <p className={`text-sm font-medium ${done || current ? "text-white" : "text-slate-600"}`}>{m.label}</p>
                  <p className="text-xs text-slate-500">{current ? (m.sub || "En proceso") : done ? "Completado" : "Pendiente"}</p>
                </div>
              </div>
            );
          })}
        </div>

        {app.estado !== "activo" ? (
          <>
            <Card className="mb-4 bg-sky-500/5 border-sky-500/20">
              <div className="flex items-start gap-2.5">
                <Info className="text-sky-400 shrink-0" size={16} />
                <p className="text-xs text-slate-400">Este proceso puede tardar hasta 24 horas. Te notificaremos cuando tengamos una respuesta.</p>
              </div>
            </Card>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <SecondaryButton onClick={handleAdvance}>
              {busy ? "Actualizando..." : "Avanzar solicitud (modo demo)"}
            </SecondaryButton>
          </>
        ) : (
          <Badge tone="success">¡Tu préstamo fue desembolsado!</Badge>
        )}
      </div>
    </div>
  );
}

function LoanDetailScreen({ loan, back, push }) {
  const proximo = loan.pagos.find((p) => p.estado === "Pendiente");
  return (
    <div className="h-full overflow-y-auto">
      <Header title="Mi préstamo" onBack={back} />
      <div className="px-5 pb-6">
        <Card className="mb-4">
          <div className="flex justify-between items-start mb-3">
            <p className="text-sm font-semibold text-white">Préstamo activo</p>
            <Badge tone="success">Activo</Badge>
          </div>
          <Row label="Monto del préstamo" value={fmtMoney(loan.monto)} />
          <Row label="Fecha de aprobación" value={loan.fechaAprobacion} />
          <Row label="Plazo" value={`${loan.meses} meses`} />
          <Row label="Tasa de interés anual" value={`${loan.tasa}%`} />
          <div className="border-t border-slate-800 my-2" />
          <Row label="Total a pagar" value={fmtMoney(loan.total)} highlight />
        </Card>

        {proximo && (
          <Card className="mb-4">
            <p className="text-sm font-semibold text-white mb-2">Próximo pago</p>
            <div className="flex justify-between">
              <div>
                <p className="text-xs text-slate-500">Fecha</p>
                <p className="text-slate-200 text-sm font-medium">{proximo.fecha}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Monto</p>
                <p className="text-slate-200 text-sm font-medium">{fmtMoney(proximo.cuota)}</p>
              </div>
            </div>
          </Card>
        )}
        <PrimaryButton onClick={() => push("calendar")}>Ver calendario de pagos</PrimaryButton>
      </div>
    </div>
  );
}

function CalendarScreen({ loan, back, onPay }) {
  const [payingNum, setPayingNum] = useState(null);
  const [error, setError] = useState("");

  if (!loan) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-8 text-center">
        <Header title="Calendario de cuotas" onBack={back} />
        <Wallet className="text-slate-700 mb-3" size={36} />
        <p className="text-slate-400 text-sm">Aún no tienes un préstamo activo con pagos programados.</p>
      </div>
    );
  }

  async function handlePay(num) {
    setError("");
    setPayingNum(num);
    try {
      await onPay(num);
    } catch (err) {
      setError(err.message);
    } finally {
      setPayingNum(null);
    }
  }

  const totalPagado = loan.pagos.filter(p => p.estado === "Pagado").length * loan.cuota;
  const nextPendingNum = loan.pagos.find(p => p.estado === "Pendiente")?.num;

  return (
    <div className="h-full overflow-y-auto">
      <Header title="Calendario de cuotas" onBack={back} />
      <div className="px-5 pb-6">
        <Card className="mb-4 flex flex-row justify-between">
          <div>
            <p className="text-xs text-slate-500">Total del préstamo</p>
            <p className="text-white font-bold">{fmtMoney(loan.monto)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Total a pagar</p>
            <p className="text-white font-bold">{fmtMoney(loan.total)}</p>
          </div>
        </Card>
        <div className="space-y-2">
          {loan.pagos.map((p) => (
            <div key={p.num} className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-slate-600 text-xs font-mono w-4">{p.num}</span>
                <div>
                  <p className="text-sm text-slate-200 font-medium">{p.fecha}</p>
                  <p className="text-xs text-slate-500">{fmtMoney(p.cuota)}</p>
                </div>
              </div>
              {p.estado === "Pagado" ? (
                <Badge tone="success">Pagado</Badge>
              ) : p.num === nextPendingNum ? (
                <button
                  onClick={() => handlePay(p.num)}
                  disabled={payingNum === p.num}
                  className="text-xs font-semibold bg-gradient-to-r from-teal-400 to-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg disabled:opacity-60"
                >
                  {payingNum === p.num ? "Pagando..." : "Pagar"}
                </button>
              ) : (
                <Badge tone="pending">Pendiente</Badge>
              )}
            </div>
          ))}
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
        <p className="text-[10px] text-slate-500 mt-3">Los pagos se consideran realizados al final del día seleccionado.</p>
      </div>
    </div>
  );
}

function HistoryScreen({ back, history }) {
  return (
    <div className="h-full overflow-y-auto">
      <Header title="Historial de préstamos" onBack={back} />
      <div className="px-5 pb-6 space-y-3">
        {history.length === 0 && <p className="text-slate-500 text-sm text-center mt-10">Aún no tienes préstamos completados.</p>}
        {history.map((h) => (
          <Card key={h.id}>
            <div className="flex justify-between items-start mb-2">
              <p className="text-teal-400 font-bold text-sm">Préstamo #{h.id}</p>
              <Badge tone="success">Pagado</Badge>
            </div>
            <Row label="Monto" value={fmtMoney(h.monto)} />
            <Row label="Total pagado" value={fmtMoney(h.totalPagado)} />
            <Row label="Fecha" value={h.fecha} />
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProfileScreen({ user, push, onLogout }) {
  const items = [
    { icon: <User size={17} />, label: "Información personal" },
    { icon: <FileText size={17} />, label: "Datos de contacto" },
    { icon: <Shield size={17} />, label: "Cambiar contraseña" },
    { icon: <CheckCircle2 size={17} />, label: "Verificación de identidad", tag: "Verificado" },
  ];
  return (
    <div className="h-full overflow-y-auto px-5 pt-5 pb-6">
      <h1 className="text-lg font-bold text-white mb-5">Mi perfil</h1>
      <Card className="mb-5 flex flex-row items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-slate-950 font-bold text-lg">
          {user.nombres[0]}
        </div>
        <div>
          <p className="text-white font-semibold">{user.nombres}</p>
          <p className="text-slate-500 text-xs">{user.correo}</p>
        </div>
      </Card>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800 mb-5">
        {items.map((it) => (
          <button key={it.label} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
            <div className="flex items-center gap-3 text-slate-200 text-sm">
              <span className="text-teal-400">{it.icon}</span>{it.label}
            </div>
            <div className="flex items-center gap-2">
              {it.tag && <Badge tone="success">{it.tag}</Badge>}
              <ChevronRight size={16} className="text-slate-600" />
            </div>
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800 mb-5">
        <button onClick={() => push("settings")} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
          <div className="flex items-center gap-3 text-slate-200 text-sm"><HelpCircle size={17} className="text-teal-400" />Configuración</div>
          <ChevronRight size={16} className="text-slate-600" />
        </button>
      </div>

      <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3.5 text-red-400 text-sm font-medium">
        <LogOut size={17} /> Cerrar sesión
      </button>
    </div>
  );
}

function SettingsScreen({ back }) {
  const items = ["Notificaciones", "Seguridad", "Privacidad", "Ayuda y soporte", "Acerca de Juranyi"];
  return (
    <div className="h-full overflow-y-auto">
      <Header title="Configuración" onBack={back} />
      <div className="px-5 pb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
          {items.map((it) => (
            <button key={it} className="w-full flex items-center justify-between px-4 py-3.5 text-left text-sm text-slate-200">
              {it} <ChevronRight size={16} className="text-slate-600" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsScreen({ notifications, markAllRead }) {
  return (
    <div className="h-full overflow-y-auto px-5 pt-5 pb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-white">Notificaciones</h1>
      </div>
      <div className="space-y-2 mb-3">
        {notifications.length === 0 && <p className="text-slate-500 text-sm text-center mt-10">No tienes notificaciones todavía.</p>}
        {notifications.map((n) => (
          <div key={n.id} className="flex items-start gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.read ? "bg-transparent" : "bg-teal-400"}`} />
            <div className="flex-1">
              <p className="text-sm text-slate-200 font-medium">{n.title}</p>
              <p className="text-xs text-slate-500">{n.subtitle}</p>
              <p className="text-[10px] text-slate-600 mt-1">{n.time}</p>
            </div>
          </div>
        ))}
      </div>
      {notifications.some((n) => !n.read) && (
        <button onClick={markAllRead} className="text-teal-400 text-xs font-semibold">Marcar todas como leídas</button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Bottom nav                                                              */
/* ---------------------------------------------------------------------- */

function BottomNav({ tab, setTab, unread }) {
  const tabs = [
    { key: "home", label: "Inicio", icon: Home },
    { key: "loans", label: "Préstamos", icon: CreditCard },
    { key: "payments", label: "Pagos", icon: Calendar },
    { key: "notifications", label: "Notificaciones", icon: Bell, badge: unread },
    { key: "profile", label: "Perfil", icon: User },
  ];
  return (
    <div className="grid grid-cols-5 border-t border-slate-800 bg-slate-950">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = tab === t.key;
        return (
          <button key={t.key} onClick={() => setTab(t.key)} className="flex flex-col items-center gap-0.5 py-2.5 relative">
            <div className="relative">
              <Icon size={19} className={active ? "text-teal-400" : "text-slate-600"} />
              {!!t.badge && <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">{t.badge}</span>}
            </div>
            <span className={`text-[9px] ${active ? "text-teal-400 font-semibold" : "text-slate-600"}`}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Loans tab (hub)                                                         */
/* ---------------------------------------------------------------------- */

function LoansTab({ activeLoan, pendingApp, push }) {
  return (
    <div className="h-full overflow-y-auto px-5 pt-5 pb-6">
      <h1 className="text-lg font-bold text-white mb-4">Préstamos</h1>
      {activeLoan ? (
        <Card className="mb-3">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-400 text-xs">Préstamo activo</p>
            <Badge tone="success">Activo</Badge>
          </div>
          <p className="text-xl font-bold text-white mb-3">{fmtMoney(activeLoan.monto)}</p>
          <PrimaryButton onClick={() => push("loanDetail")}>Ver detalle</PrimaryButton>
        </Card>
      ) : pendingApp ? (
        <Card className="mb-3">
          <div className="flex justify-between items-start mb-2">
            <p className="text-slate-400 text-xs">Solicitud</p>
            <Badge tone="pending">En evaluación</Badge>
          </div>
          <p className="text-lg font-bold text-white mb-3">#{pendingApp.id}</p>
          <PrimaryButton onClick={() => push("status", { appId: pendingApp.id })}>Ver estado</PrimaryButton>
        </Card>
      ) : (
        <Card className="mb-3">
          <p className="text-white font-semibold mb-1">No tienes préstamos activos</p>
          <p className="text-slate-400 text-xs mb-4">Simula uno nuevo y descubre tu cuota.</p>
          <PrimaryButton onClick={() => push("simulator")}>Simular préstamo</PrimaryButton>
        </Card>
      )}
      <button onClick={() => push("history")} className="w-full flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3.5 text-left">
        <div className="flex items-center gap-3 text-slate-200 text-sm"><Clock size={17} className="text-teal-400" /> Historial de préstamos</div>
        <ChevronRight size={16} className="text-slate-600" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  Root App                                                                */
/* ---------------------------------------------------------------------- */

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [token, setToken] = useState(null);
  const [appState, setAppState] = useState("splash"); // splash | auth | main
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("home");
  const [stack, setStack] = useState([]); // [{screen, props}]
  const [applications, setApplications] = useState([]); // current + past, from backend
  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pendingRequestTerms, setPendingRequestTerms] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [globalError, setGlobalError] = useState("");

  function push(screen, props = {}) { setStack((s) => [...s, { screen, props }]); }
  function pop() { setStack((s) => s.slice(0, -1)); }
  function popToTab(newTab) { setStack([]); setTab(newTab); }

  const api = (path, opts) => apiFetch(apiUrl, token, path, opts);

  // Trae el estado actualizado desde el backend (solicitudes, historial, notificaciones)
  async function refreshAll(activeToken = token) {
    setSyncing(true);
    setGlobalError("");
    try {
      const [appsRes, histRes, notifRes] = await Promise.all([
        apiFetch(apiUrl, activeToken, "/applications"),
        apiFetch(apiUrl, activeToken, "/applications/history"),
        apiFetch(apiUrl, activeToken, "/notifications"),
      ]);
      setApplications(appsRes.applications || []);
      setHistory(histRes.history || []);
      setNotifications(notifRes.notifications || []);
    } catch (err) {
      setGlobalError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleRegister(formValues) {
    const data = await api("/auth/register", { method: "POST", body: formValues });
    setToken(data.token);
    setUser(data.user);
    setAppState("main");
    await refreshAll(data.token);
  }

  async function handleLogin(correo, password) {
    const data = await api("/auth/login", { method: "POST", body: { correo, password } });
    setToken(data.token);
    setUser(data.user);
    setAppState("main");
    await refreshAll(data.token);
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    setApplications([]);
    setHistory([]);
    setNotifications([]);
    setAppState("splash");
    setStack([]);
    setTab("home");
    setAuthMode("login");
  }

  const pendingApp = applications.find((a) => a.estado === "en_evaluacion");
  const activeLoan = applications.find((a) => a.estado === "activo");

  function startRequest(terms) {
    setPendingRequestTerms(terms);
    push("request", { loanTerms: terms });
  }

  async function submitApplication(formData) {
    const data = await api("/applications", {
      method: "POST",
      body: { monto: pendingRequestTerms.monto, meses: pendingRequestTerms.meses, formData },
    });
    const app = data.application;
    setApplications((apps) => [app, ...apps]);
    setStack([{ screen: "success", props: { appId: app.id } }]);
    refreshAll(); // trae la notificación creada por el servidor
  }

  async function advanceApplication(appId) {
    const data = await api(`/applications/${appId}/advance`, { method: "POST" });
    setApplications((apps) => apps.map((a) => (a.id === appId ? data.application : a)));
    refreshAll();
  }

  async function payInstallment(loanId, num) {
    const data = await api(`/applications/${loanId}/payments/${num}/pay`, { method: "POST" });
    setApplications((apps) => apps.map((a) => (a.id === loanId ? data.application : a)));
    refreshAll(); // por si el préstamo pasó a "pagado" y entra al historial
  }

  async function markAllRead() {
    setNotifications((n) => n.map((x) => ({ ...x, read: true })));
    try {
      await api("/notifications/read-all", { method: "POST" });
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  /* ---------------- render logic ---------------- */

  let body = null;
  let showBottomNav = false;

  if (appState === "splash") {
    body = <SplashScreen onStart={() => setAppState("auth")} />;
  } else if (appState === "auth") {
    body = (
      <AuthScreen
        mode={authMode} setMode={setAuthMode}
        onLogin={handleLogin} onRegister={handleRegister}
        apiUrl={apiUrl} setApiUrl={setApiUrl}
      />
    );
  } else {
    const top = stack[stack.length - 1];

    if (top) {
      showBottomNav = false;
      switch (top.screen) {
        case "simulator":
          body = <SimulatorScreen back={pop} onRequest={startRequest} />;
          break;
        case "request":
          body = <RequestScreen back={pop} user={user} loanTerms={top.props.loanTerms} onSubmit={submitApplication} />;
          break;
        case "success":
          body = (
            <SuccessScreen
              appId={top.props.appId}
              goHome={() => popToTab("home")}
              goStatus={() => setStack([{ screen: "status", props: { appId: top.props.appId } }])}
            />
          );
          break;
        case "status": {
          const appId = top.props.appId;
          const app = applications.find((a) => a.id === appId);
          body = app
            ? <StatusScreen app={app} back={() => popToTab("home")} onAdvance={() => advanceApplication(app.id)} />
            : <div className="p-5 text-slate-400 text-sm">Cargando solicitud…</div>;
          break;
        }
        case "loanDetail":
          body = <LoanDetailScreen loan={activeLoan} back={pop} push={push} />;
          break;
        case "calendar":
          body = <CalendarScreen loan={activeLoan} back={pop} onPay={(num) => payInstallment(activeLoan.id, num)} />;
          break;
        case "history":
          body = <HistoryScreen back={pop} history={history} />;
          break;
        case "settings":
          body = <SettingsScreen back={pop} />;
          break;
        default:
          body = null;
      }
    } else {
      showBottomNav = true;
      if (tab === "home") body = <HomeScreen user={user} activeLoan={activeLoan} pendingApp={pendingApp} push={push} />;
      else if (tab === "loans") body = <LoansTab activeLoan={activeLoan} pendingApp={pendingApp} push={push} />;
      else if (tab === "payments") body = <CalendarScreen loan={activeLoan} back={null} onPay={(num) => payInstallment(activeLoan.id, num)} />;
      else if (tab === "notifications") body = <NotificationsScreen notifications={notifications} markAllRead={markAllRead} />;
      else if (tab === "profile") body = <ProfileScreen user={user} push={push} onLogout={handleLogout} />;
    }
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center sm:py-8">
      <div className="w-full sm:max-w-md min-h-screen sm:min-h-0 sm:h-[calc(100vh-4rem)] bg-slate-950 sm:rounded-3xl sm:border sm:border-slate-800 sm:shadow-2xl overflow-hidden flex flex-col relative">
        {globalError && appState === "main" && (
          <div className="mx-5 mt-4 mb-2 flex items-start justify-between gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <p className="text-[11px] text-red-300">{globalError}</p>
            <button onClick={() => setGlobalError("")} className="text-red-300 shrink-0"><X size={13} /></button>
          </div>
        )}
        <div className="flex-1 min-h-0">{body}</div>
        {showBottomNav && <BottomNav tab={tab} setTab={setTab} unread={unreadCount} />}
      </div>
    </div>
  );
}
