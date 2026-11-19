import { calculate, PMI_AUTO_TERMINATE_LTV, PMI_REQUEST_CANCEL_LTV, PMI_REQUIRED_LTV, type LoanInputs, type LoanResult, type ScheduleRow } from "./mortgage.js";
import { allStates, lookupZip, NATIONAL_AVERAGE_RATE } from "./tax.js";
import { clearState, DEFAULT_STATE, loadState, saveState, shareUrl, type FormState } from "./storage.js";
import { renderBalanceChart, renderBreakdown, renderTaxStrip } from "./charts.js";
import { formatCurrency, formatDuration, formatPercent } from "./format.js";
import { balanceMath, ensureKatex, paymentMath, scheduleMath, taxMath, type MathContext } from "./math.js";

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const form = $<HTMLFormElement>("form");
const NUMBER_FIELDS = [
  "homePrice", "downValue", "annualRate", "taxRate", "taxAnnual",
  "insuranceAnnual", "pmiRate", "hoaMonthly", "extraMonthly",
] as const satisfies ReadonlyArray<keyof FormState>;

function radios(name: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${name}"]`));
}

function readNumber(id: string): number {
  const n = $<HTMLInputElement>(id).valueAsNumber;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// State <-> form
// ---------------------------------------------------------------------------

let state: FormState = loadState();

function writeForm(s: FormState): void {
  for (const key of NUMBER_FIELDS) $<HTMLInputElement>(key).value = String(s[key]);
  $<HTMLSelectElement>("termYears").value = String(s.termYears);
  $<HTMLInputElement>("zip").value = s.zip;
  $<HTMLInputElement>("taxRateAuto").checked = s.taxRateAuto;
  $<HTMLInputElement>("pmiRequestCancel").checked = s.pmiRequestCancel;
  $<HTMLInputElement>("showMath").checked = s.showMath;
  for (const r of radios("taxMode")) r.checked = r.value === s.taxMode;
  for (const r of radios("downMode")) r.checked = r.value === s.downMode;
  for (const r of radios("scheduleView")) r.checked = r.value === s.scheduleView;
}

function readForm(): FormState {
  const checked = (name: string) => radios(name).find((r) => r.checked)?.value;
  return {
    homePrice: readNumber("homePrice"),
    downValue: readNumber("downValue"),
    downMode: checked("downMode") === "amount" ? "amount" : "percent",
    annualRate: readNumber("annualRate"),
    termYears: Number($<HTMLSelectElement>("termYears").value) || 30,
    zip: $<HTMLInputElement>("zip").value.replace(/\D/g, "").slice(0, 5),
    taxRateAuto: $<HTMLInputElement>("taxRateAuto").checked,
    taxRate: readNumber("taxRate"),
    taxMode: checked("taxMode") === "amount" ? "amount" : "percent",
    taxAnnual: readNumber("taxAnnual"),
    insuranceAnnual: readNumber("insuranceAnnual"),
    pmiRate: readNumber("pmiRate"),
    pmiRequestCancel: $<HTMLInputElement>("pmiRequestCancel").checked,
    hoaMonthly: readNumber("hoaMonthly"),
    extraMonthly: readNumber("extraMonthly"),
    scheduleView: checked("scheduleView") === "monthly" ? "monthly" : "yearly",
    showMath: $<HTMLInputElement>("showMath").checked,
  };
}

function downPaymentDollars(s: FormState): number {
  const raw = s.downMode === "percent" ? (s.homePrice * s.downValue) / 100 : s.downValue;
  return Math.min(raw, s.homePrice);
}

/** Property tax as % of home price, whichever way the user entered it. */
function effectiveTaxRate(s: FormState): number {
  if (s.taxMode === "amount") return s.homePrice > 0 ? (s.taxAnnual / s.homePrice) * 100 : 0;
  return s.taxRate;
}

function toLoanInputs(s: FormState): LoanInputs {
  return {
    homePrice: s.homePrice,
    downPayment: downPaymentDollars(s),
    annualRate: s.annualRate,
    termYears: s.termYears,
    propertyTaxRate: effectiveTaxRate(s),
    insuranceAnnual: s.insuranceAnnual,
    pmiRate: s.pmiRate,
    hoaMonthly: s.hoaMonthly,
    extraMonthly: s.extraMonthly,
    pmiRequestCancel: s.pmiRequestCancel,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(): void {
  const zipInfo = lookupZip(state.zip);
  const taxInput = $<HTMLInputElement>("taxRate");

  // When "Estimate from ZIP" is on, the ZIP drives the tax rate field.
  if (state.taxRateAuto && zipInfo && state.taxRate !== zipInfo.rate) {
    state.taxRate = zipInfo.rate;
    taxInput.value = String(zipInfo.rate);
  }
  taxInput.readOnly = state.taxRateAuto && zipInfo !== null;

  const zipStatus = $("zipStatus");
  if (!state.zip) zipStatus.textContent = "Add a ZIP to estimate property tax for your area.";
  else if (state.zip.length < 5) zipStatus.textContent = "Enter all 5 digits.";
  else if (zipInfo) zipStatus.textContent = `${zipInfo.area ?? zipInfo.name}: about ${formatPercent(zipInfo.rate)} per year on average.`;
  else zipStatus.textContent = "We don't have tax data for this ZIP. Enter a rate manually.";

  const amountMode = state.taxMode === "amount";
  const overriding = amountMode || !state.taxRateAuto;
  if (overriding) zipStatus.textContent += " Using your own property tax from Advanced instead.";
  $("taxRateWrap").hidden = amountMode;
  $("taxAnnualWrap").hidden = !amountMode;
  $("taxAutoRow").hidden = amountMode;
  const taxRate = effectiveTaxRate(state);
  $("taxHint").textContent = amountMode
    ? `${formatPercent(taxRate)} of the home price.`
    : `About ${formatCurrency((state.homePrice * taxRate) / 100)} a year. Know the actual bill? Switch to $.`;
  $("oregonNote").hidden = zipInfo?.code !== "OR";

  // Down payment unit display
  const isPercent = state.downMode === "percent";
  $("downPrefix").hidden = isPercent;
  $("downSuffix").hidden = !isPercent;
  const down = downPaymentDollars(state);
  const downPct = state.homePrice > 0 ? (down / state.homePrice) * 100 : 0;
  $("downHint").textContent = isPercent ? `${formatCurrency(down)} down` : `${formatPercent(downPct, 1)} of home price`;

  const result = calculate(toLoanInputs(state));

  const ltv = state.homePrice > 0 ? result.loanAmount / state.homePrice : 0;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  $("pmiHint").textContent =
    ltv > PMI_REQUIRED_LTV
      ? `PMI applies because you're putting down less than ${pct(1 - PMI_REQUIRED_LTV)}. By law it ends automatically when your original schedule reaches ${pct(PMI_AUTO_TERMINATE_LTV)} of the home price (extra payments don't speed that up), or earlier if you ask once your balance reaches ${pct(PMI_REQUEST_CANCEL_LTV)}.`
      : `No PMI needed with ${formatPercent(downPct, 1)} down.`;

  $("monthlyTotal").textContent = formatCurrency(result.monthly.total);
  renderBreakdown($("breakdown"), result.monthly);
  renderStats(result);
  renderTax(result, zipInfo);
  renderBalanceChart($("balanceChart"), result.schedule, result.loanAmount, state.homePrice);
  renderSchedule(result.schedule, state.scheduleView, state.homePrice);
  renderMath(result);
}

const MATH_PANELS: Array<[id: string, build: (c: MathContext) => string]> = [
  ["mathPayment", paymentMath],
  ["mathTax", taxMath],
  ["mathBalance", balanceMath],
  ["mathSchedule", scheduleMath],
];

function renderMath(result: LoanResult): void {
  const on = state.showMath;
  for (const [id] of MATH_PANELS) $(id).hidden = !on;
  if (!on) return;
  ensureKatex(render); // re-render with typeset math once KaTeX arrives

  const ctx: MathContext = {
    result,
    homePrice: state.homePrice,
    downPayment: downPaymentDollars(state),
    annualRate: state.annualRate,
    termYears: state.termYears,
    taxRate: effectiveTaxRate(state),
    taxMode: state.taxMode,
    insuranceAnnual: state.insuranceAnnual,
    pmiRate: state.pmiRate,
    pmiRequestCancel: state.pmiRequestCancel,
    hoaMonthly: state.hoaMonthly,
    extraMonthly: state.extraMonthly,
  };
  for (const [id, build] of MATH_PANELS) $(id).innerHTML = build(ctx);
}

function stat(label: string, value: string, note?: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<div class="stat"><p class="stat-label">${esc(label)}</p><p class="stat-value">${esc(value)}</p>${
    note ? `<p class="stat-note">${esc(note)}</p>` : ""
  }</div>`;
}

function payoffDate(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function renderStats(r: LoanResult): void {
  const totalPI = r.loanAmount + r.totalInterest;
  const parts = [
    stat("Loan amount", formatCurrency(r.loanAmount)),
    stat("Total interest", formatCurrency(r.totalInterest)),
    stat("Total of P&I payments", formatCurrency(totalPI)),
    stat("Payoff", formatDuration(r.payoffMonths), `about ${payoffDate(r.payoffMonths)} if you start this month`),
  ];
  if (r.totalPmi > 0) {
    const pmiMonths = r.schedule.filter((row) => row.pmi > 0).length;
    parts.push(stat("Total PMI", formatCurrency(r.totalPmi), `paid for ${formatDuration(pmiMonths)}`));
  }
  if (state.extraMonthly > 0 && r.loanAmount > 0) {
    const savedInterest = r.baselineTotalInterest - r.totalInterest;
    const savedMonths = r.baselinePayoffMonths - r.payoffMonths;
    parts.push(
      stat("Extra payments save", formatCurrency(savedInterest), `and pay off ${formatDuration(savedMonths)} sooner`),
    );
  }
  $("stats").innerHTML = parts.join("");
}

function renderTax(r: LoanResult, zipInfo: ReturnType<typeof lookupZip>): void {
  const annual = r.monthly.propertyTax * 12;
  const nationalAnnual = (state.homePrice * NATIONAL_AVERAGE_RATE) / 100;
  const diff = annual - nationalAnnual;

  const where = state.taxMode === "amount" ? "with your tax bill" : zipInfo ? `in ${zipInfo.area ?? zipInfo.name}` : "at your rate";
  const comparison =
    Math.abs(diff) < 1
      ? "about the same as the U.S. average"
      : `${formatCurrency(Math.abs(diff))}/yr ${diff > 0 ? "more" : "less"} than at the U.S. average rate`;
  $("taxSummary").textContent = `A ${formatCurrency(state.homePrice)} home ${where} pays roughly ${formatCurrency(annual)} a year in property tax, ${comparison}.`;

  const years = r.payoffMonths / 12 || state.termYears;
  $("taxFigures").innerHTML = [
    stat("Monthly", formatCurrency(r.monthly.propertyTax)),
    stat("Yearly", formatCurrency(annual)),
    stat(`Over ${formatDuration(Math.round(years * 12))}`, formatCurrency(annual * years), "at today's value, no increases"),
  ].join("");

  renderTaxStrip($("taxStrip"), allStates(), zipInfo, effectiveTaxRate(state));
}

function renderSchedule(schedule: ScheduleRow[], view: FormState["scheduleView"], homePrice: number): void {
  $("periodHeader").textContent = view === "yearly" ? "Year" : "Month";
  const tbody = $<HTMLTableElement>("schedule").tBodies[0]!;

  type Row = { label: string; principal: number; interest: number; extra: number; pmi: number; balance: number };
  let rows: Row[];
  if (view === "monthly") {
    rows = schedule.map((r) => ({ label: String(r.month), ...r }));
  } else {
    rows = [];
    for (const r of schedule) {
      const yr = Math.ceil(r.month / 12);
      let row = rows[yr - 1];
      if (!row) {
        row = { label: String(yr), principal: 0, interest: 0, extra: 0, pmi: 0, balance: 0 };
        rows.push(row);
      }
      row.principal += r.principal;
      row.interest += r.interest;
      row.extra += r.extra;
      row.pmi += r.pmi;
      row.balance = r.balance;
    }
  }

  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const v of [row.label, row.principal, row.interest, row.extra, row.pmi, row.balance, homePrice - row.balance]) {
      const td = document.createElement("td");
      td.textContent = typeof v === "string" ? v : formatCurrency(v, view === "monthly");
      tr.append(td);
    }
    frag.append(tr);
  }
  tbody.replaceChildren(frag);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function onChange(evt: Event): void {
  const target = evt.target as HTMLInputElement | null;
  const prev = state;
  state = readForm();

  // Switching $ <-> % converts the value so the down payment itself doesn't jump.
  if (target?.name === "downMode" && prev.downMode !== state.downMode) {
    const dollars = downPaymentDollars(prev);
    state.downValue =
      state.downMode === "percent"
        ? state.homePrice > 0 ? Number(((dollars / state.homePrice) * 100).toFixed(2)) : 0
        : Math.round(dollars);
    $<HTMLInputElement>("downValue").value = String(state.downValue);
  }

  // Switching tax % <-> $ carries the current estimate over.
  if (target?.name === "taxMode" && prev.taxMode !== state.taxMode) {
    if (state.taxMode === "amount") {
      state.taxAnnual = Math.round((state.homePrice * prev.taxRate) / 100);
      $<HTMLInputElement>("taxAnnual").value = String(state.taxAnnual);
    } else {
      state.taxRate = Number(effectiveTaxRate(prev).toFixed(2));
      state.taxRateAuto = false;
      $<HTMLInputElement>("taxRate").value = String(state.taxRate);
      $<HTMLInputElement>("taxRateAuto").checked = false;
    }
  }

  // Typing in the tax field means the user wants their own rate.
  if (target?.id === "taxRate") {
    state.taxRateAuto = false;
    $<HTMLInputElement>("taxRateAuto").checked = false;
  }

  saveState(state);
  render();
}

// Listen on the document because the schedule toggle lives outside the <form>.
document.addEventListener("input", onChange);

form.addEventListener("submit", (e) => e.preventDefault());

$("shareBtn").addEventListener("click", async () => {
  const status = $("actionStatus");
  const url = shareUrl(state);
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = "Link copied.";
  } catch {
    window.prompt("Copy this link:", url);
    status.textContent = "";
  }
  window.setTimeout(() => (status.textContent = ""), 2500);
});

$("resetBtn").addEventListener("click", () => {
  clearState();
  state = { ...DEFAULT_STATE };
  history.replaceState(null, "", window.location.pathname);
  writeForm(state);
  $<HTMLDetailsElement>("taxAdvanced").open = false;
  render();
});

// A shared link's values are saved locally, then the query string is removed
// so later edits aren't overwritten by the URL on reload.
if (window.location.search) {
  saveState(state);
  history.replaceState(null, "", window.location.pathname);
}

// Initial paint
writeForm(state);
// Show the Advanced section if a saved manual tax override is in effect.
$<HTMLDetailsElement>("taxAdvanced").open = state.taxMode === "amount" || !state.taxRateAuto;
render();
