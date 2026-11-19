// Persists form state in localStorage, with URL query params taking priority
// so a shared link always shows what the sender saw.

const STORAGE_KEY = "mortgage-calculator:v1";

export interface FormState {
  homePrice: number;
  downValue: number;
  downMode: "amount" | "percent";
  annualRate: number;
  termYears: number;
  zip: string;
  taxRateAuto: boolean;
  taxRate: number;
  taxMode: "percent" | "amount";
  taxAnnual: number;
  insuranceAnnual: number;
  pmiRate: number;
  pmiRequestCancel: boolean;
  hoaMonthly: number;
  extraMonthly: number;
  scheduleView: "yearly" | "monthly";
}

// Defaults are tuned for the Portland, OR metro (sources in FACTCHECK.md).
export const DEFAULT_STATE: FormState = {
  homePrice: 545_000,      // RMLS Portland-metro median sale price, Sept 2026
  downValue: 20,
  downMode: "percent",
  annualRate: 7.1,         // Freddie Mac PMMS 30-yr fixed average, week of 2026-11-12
  termYears: 30,
  zip: "",
  taxRateAuto: true,
  taxRate: 0.9,            // national average until a ZIP is entered
  taxMode: "percent",
  taxAnnual: 0,
  insuranceAnnual: 1_850,  // NerdWallet Portland average, Feb 2026
  pmiRate: 0.6,            // typical range 0.3%-1.5% by credit score and down payment
  pmiRequestCancel: false,
  hoaMonthly: 0,
  extraMonthly: 0,
  scheduleView: "yearly",
};

/** Merges untrusted data into a valid FormState, keeping defaults for anything malformed. */
function sanitize(raw: Record<string, unknown>): FormState {
  const out: FormState = { ...DEFAULT_STATE };
  for (const key of Object.keys(DEFAULT_STATE) as Array<keyof FormState>) {
    const value = raw[key];
    if (value === undefined || value === null) continue;
    const fallback = DEFAULT_STATE[key];

    if (typeof fallback === "number") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) (out[key] as number) = n;
    } else if (typeof fallback === "boolean") {
      (out[key] as boolean) = value === true || value === "true" || value === "1";
    } else if (key === "downMode") {
      if (value === "amount" || value === "percent") out.downMode = value;
    } else if (key === "taxMode") {
      if (value === "amount" || value === "percent") out.taxMode = value;
    } else if (key === "scheduleView") {
      if (value === "yearly" || value === "monthly") out.scheduleView = value;
    } else if (key === "zip") {
      out.zip = String(value).replace(/\D/g, "").slice(0, 5);
    }
  }
  return out;
}

export function loadState(): FormState {
  let stored: Record<string, unknown> = {};
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) stored = JSON.parse(json) as Record<string, unknown>;
  } catch {
    // Storage blocked or corrupted: fall back to defaults.
  }

  const params = new URLSearchParams(window.location.search);
  const fromUrl: Record<string, unknown> = {};
  params.forEach((value, key) => (fromUrl[key] = value));

  return sanitize({ ...stored, ...fromUrl });
}

export function saveState(state: FormState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: private mode or storage full.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

export function shareUrl(state: FormState): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value !== DEFAULT_STATE[key as keyof FormState]) params.set(key, String(value));
  }
  const url = new URL(window.location.href);
  url.search = params.toString();
  return url.toString();
}
