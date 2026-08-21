const MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtDate(d) {
  return `${d.getDate()} ${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function rateForTerm(months) {
  const table = { 3: 28, 6: 24, 12: 22, 18: 20 };
  return table[months] ?? null;
}

function simulateLoan(monto, meses) {
  const tasa = rateForTerm(meses);
  if (!tasa) return null;
  const interes = monto * (tasa / 100) * (meses / 12);
  const total = monto + interes;
  const cuota = total / meses;
  return {
    tasa,
    interes: Math.round(interes * 100) / 100,
    total: Math.round(total * 100) / 100,
    cuota: Math.round(cuota * 100) / 100,
  };
}

function genPagos(fechaBase, meses, cuota) {
  const pagos = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(fechaBase);
    d.setMonth(d.getMonth() + i + 1);
    pagos.push({ num: i + 1, fecha: fmtDate(d), cuota, estado: "Pendiente" });
  }
  return pagos;
}

function genApplicationId() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `JR-${yy}${mm}${dd}-${seq}`;
}

const MILESTONES = ["recibida", "evaluacion", "aprobacion", "desembolso"];

module.exports = { fmtDate, rateForTerm, simulateLoan, genPagos, genApplicationId, MILESTONES };
