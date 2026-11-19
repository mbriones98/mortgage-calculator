// "Show the math" panels: derivations plus the user's live numbers.
// Formulas are TeX rendered with KaTeX, lazy-loaded from a CDN only when the
// panels are turned on. If KaTeX can't load, the raw TeX is shown instead.

import {
  PMI_AUTO_TERMINATE_LTV,
  PMI_REQUEST_CANCEL_LTV,
  PMI_REQUIRED_LTV,
  type LoanResult,
} from "./mortgage.js";

declare global {
  interface Window {
    katex?: { renderToString(tex: string, options: { displayMode: boolean; throwOnError: boolean }): string };
  }
}

const KATEX_VERSION = "0.16.11";
const KATEX_BASE = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;
let katexRequested = false;

/** Loads KaTeX once; calls onReady when it's available. */
export function ensureKatex(onReady: () => void): void {
  if (window.katex || katexRequested) return;
  katexRequested = true;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `${KATEX_BASE}/katex.min.css`;
  css.crossOrigin = "anonymous";
  document.head.append(css);
  const script = document.createElement("script");
  script.src = `${KATEX_BASE}/katex.min.js`;
  script.crossOrigin = "anonymous";
  script.onload = onReady;
  document.head.append(script);
}

// ---------------------------------------------------------------------------
// Tiny TeX helpers
// ---------------------------------------------------------------------------

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function tex(src: string, display = true): string {
  if (window.katex) return window.katex.renderToString(src, { displayMode: display, throwOnError: false });
  return display ? `<pre class="tex-fallback">${escapeHtml(src)}</pre>` : `<code>${escapeHtml(src)}</code>`;
}
const t = (src: string) => tex(src, false);

/** Number with TeX-safe thousands separators. */
function num(v: number, digits = 2): string {
  const s = v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return s.replace(/,/g, "{,}");
}
const usd = (v: number, digits = 2) => `\\$${num(v, digits)}`;

function section(title: string, body: string): string {
  return `<h3>${escapeHtml(title)}</h3>${body}`;
}

export interface MathContext {
  result: LoanResult;
  homePrice: number;
  downPayment: number;
  annualRate: number;   // percent
  termYears: number;
  taxRate: number;      // effective percent of price
  taxMode: "percent" | "amount";
  insuranceAnnual: number;
  pmiRate: number;      // percent
  pmiRequestCancel: boolean;
  hoaMonthly: number;
  extraMonthly: number;
  homeGrowth: number;   // percent per year
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export function paymentMath(c: MathContext): string {
  const { result: R } = c;
  const P = R.loanAmount;
  const r = c.annualRate / 100 / 12;
  const n = c.termYears * 12;
  const M = R.monthly.principalAndInterest;

  const derivation = section(
    "Principal & interest: the annuity formula",
    `<p>Let ${t("P")} be the amount borrowed, ${t("r")} the monthly rate (annual rate ÷ 12), ${t("n")} the number of monthly payments, and ${t("M")} the fixed payment. The balance after payment ${t("k")} satisfies the recurrence</p>
    ${tex("B_0 = P, \\qquad B_k = (1+r)\\,B_{k-1} - M.")}
    <p>Unrolling it gives a geometric series:</p>
    ${tex("B_k = P(1+r)^k - M\\sum_{j=0}^{k-1}(1+r)^j = P(1+r)^k - M\\,\\frac{(1+r)^k - 1}{r}.")}
    <p>The loan is paid off when ${t("B_n = 0")}. Solving for ${t("M")}:</p>
    ${tex("M = \\frac{P\\,r\\,(1+r)^n}{(1+r)^n - 1} = \\frac{P\\,r}{1-(1+r)^{-n}}.")}
    <p>As ${t("r \\to 0")}, this tends to ${t("M = P/n")}, which is the formula used for a 0% loan.</p>`,
  );

  const plugged =
    P <= 0
      ? "<p>No loan amount yet, so there's nothing to plug in.</p>"
      : r === 0
        ? tex(`M = \\frac{P}{n} = \\frac{${usd(P, 0)}}{${n}} = ${usd(M)}`)
        : tex(
            `\\begin{aligned}
            P &= ${usd(c.homePrice, 0)} - ${usd(c.downPayment, 0)} = ${usd(P, 0)} \\\\
            r &= \\frac{${num(c.annualRate, 3)}\\%}{12} = ${num(r, 6)} \\\\
            n &= ${c.termYears} \\times 12 = ${n} \\\\
            M &= \\frac{${usd(P, 0)} \\times ${num(r, 6)}}{1 - (1 + ${num(r, 6)})^{-${n}}} = ${usd(M)}
            \\end{aligned}`,
          );

  const m = R.monthly;
  const total = section(
    "Total monthly payment",
    `${tex("\\text{Total} = M + \\frac{T}{12} + \\frac{H}{12} + \\text{PMI} + \\text{HOA}")}
    <p>where ${t("T")} is the annual property tax and ${t("H")} the annual home insurance:</p>
    ${tex(`${usd(m.principalAndInterest)} + ${usd(m.propertyTax)} + ${usd(m.insurance)} + ${usd(m.pmi)} + ${usd(m.hoa)} = ${usd(m.total)}`)}`,
  );

  return derivation + section("With your numbers", plugged) + total + pmiMath(c);
}

function pmiMath(c: MathContext): string {
  const { result: R } = c;
  const P = R.loanAmount;
  const V = c.homePrice;
  const r = c.annualRate / 100 / 12;
  const n = c.termYears * 12;
  const M = R.monthly.principalAndInterest;
  const ltv = V > 0 ? P / V : 0;

  let body = `<p>PMI applies when the initial loan-to-value ratio ${t("\\text{LTV}_0 = P/V")} exceeds ${t(String(PMI_REQUIRED_LTV))}. Your ${t(
    `\\text{LTV}_0 = ${usd(P, 0)} / ${usd(V, 0)} = ${num(ltv, 4)}`,
  )}.</p>`;

  if (ltv <= PMI_REQUIRED_LTV || P <= 0) {
    return section("PMI", body + "<p>That's at or below 0.8, so there's no PMI.</p>");
  }

  const monthlyPmi = (P * c.pmiRate) / 100 / 12;
  body += `<p>The premium is a fixed annual percentage ${t("p")} of the original loan:</p>
    ${tex(`\\text{PMI} = \\frac{P\\,p}{12} = \\frac{${usd(P, 0)} \\times ${num(c.pmiRate, 2)}\\%}{12} = ${usd(monthlyPmi)}`)}
    <p>Under the Homeowners Protection Act, PMI ends automatically at the first ${t("k")} where the <em>original</em> schedule (no extra payments) reaches ${t(
      `${PMI_AUTO_TERMINATE_LTV}\\,V`,
    )}. Setting ${t(`B_k \\le cV`)} in the closed form above and solving (using ${t("M > rP")}):</p>
    ${tex("k_{\\text{auto}} = \\left\\lceil \\frac{\\ln\\!\\big((M - r\\,cV)/(M - rP)\\big)}{\\ln(1+r)} \\right\\rceil, \\qquad c = 0.78.")}`;

  if (r > 0) {
    const cV = PMI_AUTO_TERMINATE_LTV * V;
    const kAuto = Math.ceil(Math.log((M - r * cV) / (M - r * P)) / Math.log(1 + r));
    body += tex(`k_{\\text{auto}} = \\left\\lceil \\frac{\\ln\\!\\big((${num(M)} - ${num(r, 6)} \\times ${num(cV, 0)})/(${num(M)} - ${num(r, 6)} \\times ${num(P, 0)})\\big)}{\\ln(1 + ${num(r, 6)})} \\right\\rceil = ${kAuto}`);
  }

  const pmiMonths = R.schedule.filter((row) => row.pmi > 0).length;
  body += `<p>It also can't run past the midpoint, ${t(`n/2 = ${n / 2}`)}${
    c.pmiRequestCancel
      ? `, and since you'll request cancellation it ends as soon as the <em>actual</em> balance (including extra payments) reaches ${t(`${PMI_REQUEST_CANCEL_LTV}\\,V`)}`
      : ""
  }. PMI is charged for the months ${t("k")} whose opening balance hasn't crossed these lines, so you pay it for ${t(`${pmiMonths}`)} months, totaling ${t(
    usd(R.totalPmi, 0),
  )}.</p>`;

  return section("PMI", body);
}

export function taxMath(c: MathContext): string {
  const V = c.homePrice;
  const T = (V * c.taxRate) / 100;
  const years = c.result.payoffMonths / 12 || c.termYears;
  const rateLine =
    c.taxMode === "amount"
      ? `<p>You entered the annual bill directly, so the effective rate is implied:</p>${tex(`\\tau = \\frac{T}{V} = \\frac{${usd(T, 0)}}{${usd(V, 0)}} = ${num(c.taxRate, 3)}\\%`)}`
      : `<p>Property tax is modeled as an effective rate ${t("\\tau")} times the home's value ${t("V")}:</p>${tex(`T = \\tau V = ${num(c.taxRate, 2)}\\% \\times ${usd(V, 0)} = ${usd(T)}`)}`;

  return (
    section("Annual and monthly tax", `${rateLine}${tex(`\\frac{T}{12} = ${usd(T / 12)} \\text{ per month}`)}`) +
    section(
      "Over the life of the loan",
      `<p>Held flat (no growth in value or levy), the total is linear in time:</p>
      ${tex(`T \\times \\frac{\\text{months}}{12} = ${usd(T, 0)} \\times ${num(years, 2)} = ${usd(T * years, 0)}`)}
      <p>In reality, Oregon's assessed value can grow up to 3% a year under Measure 50. With growth ${t("g")}, the total becomes the geometric sum ${t(
        "T\\sum_{j=0}^{Y-1}(1+g)^j = T\\,\\frac{(1+g)^Y - 1}{g}",
      )}. At ${t("g = 3\\%")} over ${t(`Y = ${Math.round(years)}`)} years that's ${t(
        usd((T * (Math.pow(1.03, Math.round(years)) - 1)) / 0.03, 0),
      )}.</p>`,
    )
  );
}

export function balanceMath(c: MathContext): string {
  const { result: R } = c;
  const P = R.loanAmount;
  const V = c.homePrice;
  const r = c.annualRate / 100 / 12;
  const n = c.termYears * 12;
  const M = R.monthly.principalAndInterest;
  const x = c.extraMonthly;

  let html = section(
    "Model",
    `<p>A fixed-rate, fully amortizing loan with monthly compounding. Each month ${t("k")}:</p>
    ${tex(
      `\\begin{aligned}
      \\text{interest}_k &= r\\,B_{k-1} \\\\
      \\text{principal}_k &= M - \\text{interest}_k \\\\
      B_k &= B_{k-1} - \\text{principal}_k - x
      \\end{aligned}`,
    )}
    <p>where ${t("x")} is your extra monthly principal (${t(usd(x, 0))}). The five lines on the chart are</p>
    ${tex(
      `\\underbrace{B_k}_{\\text{balance}}, \\quad \\underbrace{P - B_k}_{\\text{principal paid}}, \\quad \\underbrace{\\textstyle\\sum_{j\\le k} \\text{interest}_j}_{\\text{interest paid}}, \\quad \\underbrace{V_k}_{\\text{home value}}, \\quad \\underbrace{V_k - B_k}_{\\text{equity}}`,
    )}
    <p>Equity starts at your down payment ${t(`V - P = ${usd(V - P, 0)}`)}.</p>`,
  );

  html += equityMath(c);
  if (P <= 0 || r === 0) return html;

  // Principal portion grows geometrically (without extra payments).
  const p1 = M - r * P;
  const crossRaw = 1 + Math.log(M / (2 * p1)) / Math.log(1 + r);
  const cross = Math.max(1, Math.ceil(crossRaw));
  html += section(
    "Why the curves bend",
    `<p>Without extra payments, ${t("\\text{principal}_k = M - rB_{k-1}")} and ${t("B_{k-1} - B_k = \\text{principal}_k")} give ${t(
      "\\text{principal}_{k+1} = (1+r)\\,\\text{principal}_k",
    )}. So the principal portion grows geometrically:</p>
    ${tex(`\\text{principal}_k = (M - rP)(1+r)^{k-1} = ${usd(p1)} \\times (1 + ${num(r, 6)})^{k-1}`)}
    <p>That's why the balance curve is concave: it falls slowly at first, then faster. Principal overtakes interest once ${t(
      "\\text{principal}_k \\ge M/2",
    )}:</p>
    ${tex(`k^* = \\left\\lceil 1 + \\frac{\\ln\\!\\big(M / (2(M - rP))\\big)}{\\ln(1+r)} \\right\\rceil = ${cross} \\;\\;(\\text{year } ${num(cross / 12, 1)})`)}`,
  );

  html += section(
    "Total interest",
    `<p>With no extra payments, you make ${t("n")} payments of ${t("M")} and repay ${t("P")}, so</p>
    ${tex(`I_{\\text{total}} = nM - P = ${n} \\times ${usd(M)} - ${usd(P, 0)} = ${usd(n * M - P, 0)}`)}`,
  );

  if (x > 0) {
    const nPrime = -Math.log(1 - (r * P) / (M + x)) / Math.log(1 + r);
    html += section(
      "Effect of extra payments",
      `<p>Paying ${t("M + x")} every month is just an annuity with a larger payment. Solving ${t("B_{n'} = 0")} for the number of payments:</p>
      ${tex(`n' = -\\frac{\\ln\\!\\big(1 - rP/(M+x)\\big)}{\\ln(1+r)} = -\\frac{\\ln\\!\\big(1 - ${num(r, 6)} \\times ${num(P, 0)} / ${num(M + x)}\\big)}{\\ln(1 + ${num(r, 6)})} = ${num(nPrime, 2)}`)}
      <p>so the loan is paid off in ${t(`\\lceil n' \\rceil = ${Math.ceil(nPrime)}`)} months instead of ${t(String(n))}, saving ${t(
        usd(R.baselineTotalInterest - R.totalInterest, 0),
      )} in interest.</p>`,
    );
  }
  return html;
}

function equityMath(c: MathContext): string {
  const V = c.homePrice;
  const g = c.homeGrowth / 100;
  const R = c.result;
  const k = R.payoffMonths;
  const Vk = V * Math.pow(1 + g, k / 12);
  const at10 = k > 120;
  const V120 = V * Math.pow(1 + g, 10);
  const B120 = R.schedule[119]?.balance ?? 0;
  return section(
    "Future home value and equity",
    `<p>The home's value compounds at your annual growth rate ${t(`g = ${num(c.homeGrowth, 2)}\\%`)}. Using a fractional exponent makes each full year multiply the value by exactly ${t("1+g")} (equivalently, a monthly factor of ${t("(1+g)^{1/12}")}):</p>
    ${tex("V_k = V\\,(1+g)^{k/12}, \\qquad E_k = V_k - B_k = \\underbrace{(V_k - V)}_{\\text{appreciation}} + \\underbrace{(V - P)}_{\\text{down payment}} + \\underbrace{(P - B_k)}_{\\text{principal paid}}")}
    ${
      at10
        ? tex(`k = 120:\\quad E_{120} = ${usd(V, 0)}(1 + ${num(g, 4)})^{10} - ${usd(B120, 0)} = ${usd(V120, 0)} - ${usd(B120, 0)} = ${usd(V120 - B120, 0)}`)
        : ""
    }
    ${tex(`k = ${k} \\text{ (payoff)}:\\quad E_{${k}} = V_{${k}} = ${usd(V, 0)}(1 + ${num(g, 4)})^{${num(k / 12, 2)}} = ${usd(Vk, 0)}`)}
    <p>A constant ${t("g")} is a modeling assumption, not a forecast. Real prices move in cycles and can fall.</p>`,
  );
}

export function scheduleMath(c: MathContext): string {
  const r = c.annualRate / 100 / 12;
  return section(
    "How each row is computed",
    `<p>Monthly rows apply the recurrence directly (${t(`r = ${num(r, 6)}`)}):</p>
    ${tex("\\text{interest}_k = rB_{k-1}, \\quad \\text{principal}_k = \\min(M - \\text{interest}_k,\\; B_{k-1}), \\quad B_k = B_{k-1} - \\text{principal}_k - x_k")}
    <p>The ${t("\\min")} makes the final payment exactly clear the balance. Yearly rows sum the 12 monthly values for principal, interest, extra and PMI, and report the balance, home value and equity after the year's last payment. Home value is ${t(
      "V_k = V(1+g)^{k/12}",
    )} and equity is ${t("E_k = V_k - B_k")}.</p>`,
  );
}
