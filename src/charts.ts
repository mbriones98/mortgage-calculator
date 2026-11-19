// Hand-rolled SVG charts. Colors come from CSS classes so light/dark themes work.

import type { MonthlyBreakdown, ScheduleRow } from "./mortgage.js";
import { NATIONAL_AVERAGE_RATE, type StateTaxInfo } from "./tax.js";
import { formatCurrency, formatPercent } from "./format.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------
// Monthly payment breakdown: one stacked bar + legend
// ---------------------------------------------------------------------------

export const BREAKDOWN_PARTS: Array<{ key: keyof Omit<MonthlyBreakdown, "total">; label: string; cls: string }> = [
  { key: "principalAndInterest", label: "Principal & interest", cls: "c-pi" },
  { key: "propertyTax", label: "Property tax", cls: "c-tax" },
  { key: "insurance", label: "Home insurance", cls: "c-ins" },
  { key: "pmi", label: "PMI", cls: "c-pmi" },
  { key: "hoa", label: "HOA", cls: "c-hoa" },
];

export function renderBreakdown(container: HTMLElement, monthly: MonthlyBreakdown): void {
  container.replaceChildren();
  const bar = document.createElement("div");
  bar.className = "stack-bar";
  const legend = document.createElement("ul");
  legend.className = "legend";

  for (const part of BREAKDOWN_PARTS) {
    const value = monthly[part.key];
    if (value <= 0) continue;
    const pct = monthly.total > 0 ? (value / monthly.total) * 100 : 0;

    const seg = document.createElement("span");
    seg.className = `seg ${part.cls}`;
    seg.style.width = `${pct}%`;
    seg.title = `${part.label}: ${formatCurrency(value)} (${pct.toFixed(1)}%)`;
    bar.append(seg);

    const li = document.createElement("li");
    li.innerHTML = `<span class="swatch ${part.cls}"></span><span class="legend-label"></span><span class="legend-value"></span>`;
    li.querySelector(".legend-label")!.textContent = part.label;
    li.querySelector(".legend-value")!.textContent = formatCurrency(value);
    legend.append(li);
  }
  container.append(bar, legend);
}

// ---------------------------------------------------------------------------
// Balance over time: remaining balance, cumulative principal and interest
// ---------------------------------------------------------------------------

export function renderBalanceChart(container: HTMLElement, schedule: ScheduleRow[], loanAmount: number, homePrice: number): void {
  container.replaceChildren();
  if (schedule.length === 0 || loanAmount <= 0) {
    container.textContent = "Enter a loan amount to see the chart.";
    return;
  }

  const W = 640, H = 280;
  const pad = { top: 16, right: 16, bottom: 32, left: 64 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  // Sample at year ends (plus month 0) to keep the path small.
  // Equity assumes the home keeps its purchase price (no appreciation).
  type Point = { month: number; balance: number; principalPaid: number; interestPaid: number; equity: number };
  const points: Point[] = [{ month: 0, balance: loanAmount, principalPaid: 0, interestPaid: 0, equity: homePrice - loanAmount }];
  schedule.forEach((row, i) => {
    if (row.month % 12 === 0 || i === schedule.length - 1) {
      points.push({
        month: row.month,
        balance: row.balance,
        principalPaid: loanAmount - row.balance,
        interestPaid: row.totalInterest,
        equity: homePrice - row.balance,
      });
    }
  });

  const maxMonth = points[points.length - 1]!.month;
  const maxY = Math.max(homePrice, loanAmount, points[points.length - 1]!.interestPaid);
  const x = (m: number) => pad.left + (m / maxMonth) * innerW;
  const y = (v: number) => pad.top + innerH - (v / maxY) * innerH;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Loan balance over time" });

  // Gridlines + y labels
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (maxY / ticks) * i;
    svg.append(el("line", { x1: pad.left, x2: W - pad.right, y1: y(v), y2: y(v), class: "grid" }));
    svg.append(el("text", { x: pad.left - 8, y: y(v) + 4, "text-anchor": "end", class: "axis-label" }, compactCurrency(v)));
  }
  // X labels every ~5 years
  const years = Math.ceil(maxMonth / 12);
  const step = years > 20 ? 5 : years > 10 ? 2 : 1;
  for (let yr = 0; yr <= years; yr += step) {
    const m = Math.min(yr * 12, maxMonth);
    svg.append(el("text", { x: x(m), y: H - 10, "text-anchor": "middle", class: "axis-label" }, `Yr ${yr}`));
  }

  const series: Array<{ key: keyof Omit<Point, "month">; cls: string; label: string }> = [
    { key: "balance", cls: "line-balance", label: "Remaining balance" },
    { key: "principalPaid", cls: "line-principal", label: "Principal paid" },
    { key: "interestPaid", cls: "line-interest", label: "Interest paid" },
    { key: "equity", cls: "line-equity", label: "Equity" },
  ];
  for (const s of series) {
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.month).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join("");
    svg.append(el("path", { d, class: `line ${s.cls}` }));
  }

  // Hover: vertical rule + tooltip
  const rule = el("line", { y1: pad.top, y2: pad.top + innerH, class: "hover-rule", visibility: "hidden" });
  svg.append(rule);
  const dots = series.map((s) => {
    const c = el("circle", { r: 4, class: `dot ${s.cls}`, visibility: "hidden" });
    svg.append(c);
    return c;
  });
  const overlay = el("rect", { x: pad.left, y: pad.top, width: innerW, height: innerH, fill: "transparent" });
  svg.append(overlay);

  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  tooltip.hidden = true;

  const legend = document.createElement("ul");
  legend.className = "legend legend-inline";
  for (const s of series) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="swatch ${s.cls}"></span>`;
    li.append(s.label);
    legend.append(li);
  }

  const onMove = (evt: PointerEvent) => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((evt.clientX - rect.left) / rect.width) * W;
    const month = ((svgX - pad.left) / innerW) * maxMonth;
    let nearest = points[0]!;
    for (const p of points) if (Math.abs(p.month - month) < Math.abs(nearest.month - month)) nearest = p;

    const px = x(nearest.month);
    rule.setAttribute("x1", String(px));
    rule.setAttribute("x2", String(px));
    rule.setAttribute("visibility", "visible");
    series.forEach((s, i) => {
      dots[i]!.setAttribute("cx", String(px));
      dots[i]!.setAttribute("cy", String(y(nearest[s.key])));
      dots[i]!.setAttribute("visibility", "visible");
    });

    const yr = nearest.month / 12;
    tooltip.innerHTML = "";
    const title = document.createElement("strong");
    title.textContent = nearest.month === 0 ? "Start" : `Year ${Number.isInteger(yr) ? yr : yr.toFixed(1)}`;
    tooltip.append(title);
    for (const s of series) {
      const row = document.createElement("div");
      row.innerHTML = `<span class="swatch ${s.cls}"></span>`;
      row.append(`${s.label}: ${formatCurrency(nearest[s.key])}`);
      tooltip.append(row);
    }
    tooltip.hidden = false;
    const leftPct = (px / W) * 100;
    tooltip.style.left = `${leftPct}%`;
    tooltip.classList.toggle("flip", leftPct > 60);
  };
  const onLeave = () => {
    rule.setAttribute("visibility", "hidden");
    dots.forEach((d) => d.setAttribute("visibility", "hidden"));
    tooltip.hidden = true;
  };
  overlay.addEventListener("pointermove", onMove);
  overlay.addEventListener("pointerdown", onMove);
  overlay.addEventListener("pointerleave", onLeave);

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  wrap.append(svg, tooltip);
  container.append(legend, wrap);
}

// ---------------------------------------------------------------------------
// Property tax: where your state sits among all states
// ---------------------------------------------------------------------------

export function renderTaxStrip(
  container: HTMLElement,
  states: StateTaxInfo[],
  selected: StateTaxInfo | null,
  currentRate: number,
): void {
  container.replaceChildren();
  const W = 640, H = 96;
  const pad = { left: 16, right: 16 };
  const innerW = W - pad.left - pad.right;
  const maxRate = Math.max(...states.map((s) => s.rate), currentRate, 2.2);
  const x = (r: number) => pad.left + (r / maxRate) * innerW;
  const axisY = 56;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Property tax rate compared with all states" });
  svg.append(el("line", { x1: pad.left, x2: W - pad.right, y1: axisY, y2: axisY, class: "grid" }));

  for (const s of states) {
    const tick = el("line", {
      x1: x(s.rate), x2: x(s.rate), y1: axisY - 10, y2: axisY + 10,
      class: s.code === selected?.code ? "tick tick-selected" : "tick",
    });
    tick.append(el("title", {}, `${s.name}: ${formatPercent(s.rate)}`));
    svg.append(tick);
  }

  // National average marker
  const avgX = x(NATIONAL_AVERAGE_RATE);
  svg.append(el("line", { x1: avgX, x2: avgX, y1: axisY - 18, y2: axisY + 18, class: "avg-mark" }));
  svg.append(el("text", { x: avgX, y: axisY + 32, "text-anchor": "middle", class: "axis-label" }, `US avg ${formatPercent(NATIONAL_AVERAGE_RATE)}`));

  // Your rate marker
  const youX = x(currentRate);
  svg.append(el("path", { d: `M${youX - 7},${axisY - 30} L${youX + 7},${axisY - 30} L${youX},${axisY - 20} Z`, class: "you-mark" }));
  const label = selected ? `${selected.code} ${formatPercent(currentRate)}` : `You ${formatPercent(currentRate)}`;
  const anchor = youX < 80 ? "start" : youX > W - 80 ? "end" : "middle";
  svg.append(el("text", { x: youX, y: axisY - 36, "text-anchor": anchor, class: "you-label" }, label));

  svg.append(el("text", { x: pad.left, y: H - 4, class: "axis-label" }, "0%"));
  svg.append(el("text", { x: W - pad.right, y: H - 4, "text-anchor": "end", class: "axis-label" }, formatPercent(maxRate)));

  container.append(svg);
}

function compactCurrency(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}
