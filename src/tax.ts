// ZIP code -> state -> estimated property tax rate.
//
// Rates are statewide average *effective* property tax rates (real estate
// taxes paid as a percent of owner-occupied home value).
// Source: Tax Foundation, "Property Taxes by State and County, 2026"
// (2024 ACS data). OR, WA and the states most out of date were refreshed
// 2026-11-18; the rest are from the prior edition and are within ~0.05 pts.
// Actual rates vary a lot by county and city, so the UI lets the user
// override the value. See FACTCHECK.md for details.

export interface StateTaxInfo {
  code: string;
  name: string;
  rate: number;    // percent
  area?: string;   // set when a local (sub-state) estimate was used
}

/** NAHB analysis of 2024 ACS: $8.88 per $1,000 of value (0.89%). */
export const NATIONAL_AVERAGE_RATE = 0.9;

// Local overrides for the Portland metro, where county rates differ from the
// statewide average. Only ZIPs that sit mostly inside one county are listed.
interface LocalArea { name: string; rate: number; zips: string[] }

const LOCAL_AREAS: LocalArea[] = [
  {
    // Tax Foundation 2026 / ACS 2024: Multnomah County 1.02%.
    name: "Multnomah County (Portland)",
    rate: 1.0,
    zips: [
      "97201", "97202", "97203", "97204", "97205", "97206", "97209", "97210", "97211", "97212",
      "97213", "97214", "97215", "97216", "97217", "97218", "97220", "97227", "97230", "97232",
      "97233", "97236", "97239", "97266", // Portland
      "97030", "97080", "97024", "97060", // Gresham, Fairview, Troutdale
    ],
  },
  {
    // City of Vancouver 2025 levies: $9.69-$10.10 per $1,000; WA assesses near market value.
    name: "Clark County (Vancouver)",
    rate: 0.95,
    zips: [
      ...Array.from({ length: 28 }, (_, i) => String(98660 + i)), // 98660-98687 Vancouver
      "98604", "98606", "98607", "98642", "98671", // Battle Ground, Brush Prairie, Camas, Ridgefield, Washougal
    ],
  },
];

const LOCAL_BY_ZIP = new Map<string, LocalArea>();
for (const area of LOCAL_AREAS) for (const z of area.zips) LOCAL_BY_ZIP.set(z, area);

const STATES: Record<string, [name: string, rate: number]> = {
  AL: ["Alabama", 0.37], AK: ["Alaska", 0.94], AZ: ["Arizona", 0.52], AR: ["Arkansas", 0.57],
  CA: ["California", 0.7], CO: ["Colorado", 0.5], CT: ["Connecticut", 1.54], DE: ["Delaware", 0.51],
  DC: ["District of Columbia", 0.57], FL: ["Florida", 0.79], GA: ["Georgia", 0.79], HI: ["Hawaii", 0.29],
  ID: ["Idaho", 0.47], IL: ["Illinois", 1.88], IN: ["Indiana", 0.75], IA: ["Iowa", 1.33],
  KS: ["Kansas", 1.21], KY: ["Kentucky", 0.75], LA: ["Louisiana", 0.56], ME: ["Maine", 1.09],
  MD: ["Maryland", 0.99], MA: ["Massachusetts", 1.04], MI: ["Michigan", 1.24], MN: ["Minnesota", 1.02],
  MS: ["Mississippi", 0.67], MO: ["Missouri", 0.88], MT: ["Montana", 0.68], NE: ["Nebraska", 1.44],
  NV: ["Nevada", 0.48], NH: ["New Hampshire", 1.5], NJ: ["New Jersey", 1.88], NM: ["New Mexico", 0.67],
  NY: ["New York", 1.3], NC: ["North Carolina", 0.7], ND: ["North Dakota", 0.92], OH: ["Ohio", 1.36],
  OK: ["Oklahoma", 0.82], OR: ["Oregon", 0.81], PA: ["Pennsylvania", 1.26], RI: ["Rhode Island", 1.32],
  SC: ["South Carolina", 0.51], SD: ["South Dakota", 1.08], TN: ["Tennessee", 0.56], TX: ["Texas", 1.4],
  UT: ["Utah", 0.52], VT: ["Vermont", 1.51], VA: ["Virginia", 0.78], WA: ["Washington", 0.75],
  WV: ["West Virginia", 0.51], WI: ["Wisconsin", 1.32], WY: ["Wyoming", 0.55],
};

// Inclusive 3-digit ZIP prefix ranges -> state code (USPS assignments).
const PREFIX_RANGES: Array<[from: number, to: number, state: string]> = [
  [5, 5, "NY"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"],
  [50, 54, "VT"], [55, 55, "MA"], [56, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"],
  [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 200, "DC"], [201, 201, "VA"],
  [202, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"],
  [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"],
  [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"],
  [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [569, 569, "DC"],
  [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"],
  [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 731, "OK"],
  [733, 733, "TX"], [734, 749, "OK"], [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"],
  [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"],
  [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"],
  [995, 999, "AK"],
];

/** Returns state tax info for a 5-digit ZIP, or null if unknown/invalid. */
export function lookupZip(zip: string): StateTaxInfo | null {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;
  const prefix = Number(trimmed.slice(0, 3));
  const match = PREFIX_RANGES.find(([from, to]) => prefix >= from && prefix <= to);
  if (!match) return null;
  const code = match[2];
  const info = STATES[code];
  if (!info) return null;
  const local = LOCAL_BY_ZIP.get(trimmed);
  return local
    ? { code, name: info[0], rate: local.rate, area: local.name }
    : { code, name: info[0], rate: info[1] };
}

/** All states sorted by rate, for the comparison chart. */
export function allStates(): StateTaxInfo[] {
  return Object.entries(STATES)
    .map(([code, [name, rate]]) => ({ code, name, rate }))
    .sort((a, b) => a.rate - b.rate);
}
