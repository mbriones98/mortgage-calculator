// Pure mortgage math: no DOM access here, so it is easy to test and reason about.

export interface LoanInputs {
  homePrice: number;
  downPayment: number;      // dollars
  annualRate: number;       // percent, e.g. 6.5
  termYears: number;
  propertyTaxRate: number;  // percent of home price per year
  insuranceAnnual: number;  // dollars per year
  pmiRate: number;          // percent of original loan per year
  hoaMonthly: number;       // dollars per month
  extraMonthly: number;     // extra principal per month
  pmiRequestCancel: boolean; // borrower asks to cancel PMI at 80% LTV
}

export interface ScheduleRow {
  month: number;          // 1-based payment number
  payment: number;        // principal + interest actually paid this month (incl. extra)
  principal: number;
  interest: number;
  extra: number;
  pmi: number;
  balance: number;        // balance after this payment
  totalInterest: number;  // cumulative
}

export interface MonthlyBreakdown {
  principalAndInterest: number;
  propertyTax: number;
  insurance: number;
  pmi: number;            // first-month PMI (0 if not required)
  hoa: number;
  total: number;
}

export interface LoanResult {
  loanAmount: number;
  monthly: MonthlyBreakdown;
  schedule: ScheduleRow[];
  totalInterest: number;
  totalPmi: number;
  payoffMonths: number;
  // Baseline (no extra payments) for comparison
  baselineTotalInterest: number;
  baselinePayoffMonths: number;
}

/**
 * PMI rules (Homeowners Protection Act, 12 U.S.C. §4901-4902):
 * - Required when the loan is more than 80% of the home's value.
 * - Ends automatically when the ORIGINAL schedule reaches 78% LTV (extra payments don't speed this up).
 * - The borrower may request cancellation once the ACTUAL balance reaches 80% LTV.
 * - Can't be charged past the midpoint of the loan term.
 */
export const PMI_REQUIRED_LTV = 0.8;
export const PMI_AUTO_TERMINATE_LTV = 0.78;
export const PMI_REQUEST_CANCEL_LTV = 0.8;

/** Standard amortized monthly payment (principal + interest). */
export function monthlyPI(principal: number, annualRate: number, termYears: number): number {
  const n = termYears * 12;
  if (principal <= 0 || n <= 0) return 0;
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Balance on the original schedule after k payments (no extra payments). */
function scheduledBalance(principal: number, annualRate: number, pi: number, k: number): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return Math.max(principal - pi * k, 0);
  const growth = Math.pow(1 + r, k);
  return Math.max(principal * growth - (pi * (growth - 1)) / r, 0);
}

function buildSchedule(inputs: LoanInputs, loanAmount: number, basePI: number, extraMonthly: number): ScheduleRow[] {
  const r = inputs.annualRate / 100 / 12;
  const maxMonths = inputs.termYears * 12;
  const pmiMonthly = (loanAmount * inputs.pmiRate) / 100 / 12;
  const pmiApplies = inputs.homePrice > 0 && loanAmount / inputs.homePrice > PMI_REQUIRED_LTV;
  const autoTerminateBalance = inputs.homePrice * PMI_AUTO_TERMINATE_LTV;
  const requestCancelBalance = inputs.homePrice * PMI_REQUEST_CANCEL_LTV;
  const midpointMonth = maxMonths / 2;

  const pmiChargedFor = (month: number, openingBalance: number): boolean => {
    if (!pmiApplies || month > midpointMonth) return false;
    if (scheduledBalance(loanAmount, inputs.annualRate, basePI, month - 1) <= autoTerminateBalance) return false;
    if (inputs.pmiRequestCancel && openingBalance <= requestCancelBalance) return false;
    return true;
  };

  const rows: ScheduleRow[] = [];
  let balance = loanAmount;
  let totalInterest = 0;
  let pmiEnded = false;

  for (let month = 1; month <= maxMonths && balance > 0.005; month++) {
    const interest = balance * r;
    let principal = Math.min(basePI - interest, balance);
    if (principal < 0) principal = 0; // guards against pathological inputs
    const extra = Math.min(extraMonthly, balance - principal);
    // Once PMI ends it never comes back.
    if (!pmiEnded && !pmiChargedFor(month, balance)) pmiEnded = true;
    const pmi = pmiEnded ? 0 : pmiMonthly;

    balance -= principal + extra;
    totalInterest += interest;

    rows.push({
      month,
      payment: principal + interest + extra,
      principal,
      interest,
      extra,
      pmi,
      balance: Math.max(balance, 0),
      totalInterest,
    });
  }
  return rows;
}

export function calculate(inputs: LoanInputs): LoanResult {
  const loanAmount = Math.max(inputs.homePrice - inputs.downPayment, 0);
  const pi = monthlyPI(loanAmount, inputs.annualRate, inputs.termYears);

  const schedule = buildSchedule(inputs, loanAmount, pi, Math.max(inputs.extraMonthly, 0));
  const baseline = inputs.extraMonthly > 0 ? buildSchedule(inputs, loanAmount, pi, 0) : schedule;

  const propertyTax = (inputs.homePrice * inputs.propertyTaxRate) / 100 / 12;
  const insurance = inputs.insuranceAnnual / 12;
  const pmi = schedule[0]?.pmi ?? 0;
  const hoa = inputs.hoaMonthly;

  const sum = (rows: ScheduleRow[], key: "interest" | "pmi") => rows.reduce((acc, row) => acc + row[key], 0);

  return {
    loanAmount,
    monthly: {
      principalAndInterest: pi,
      propertyTax,
      insurance,
      pmi,
      hoa,
      total: pi + propertyTax + insurance + pmi + hoa,
    },
    schedule,
    totalInterest: sum(schedule, "interest"),
    totalPmi: sum(schedule, "pmi"),
    payoffMonths: schedule.length,
    baselineTotalInterest: sum(baseline, "interest"),
    baselinePayoffMonths: baseline.length,
  };
}
