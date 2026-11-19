# Fact-check: mortgage calculator inputs (Portland, OR focus)

Checked 2026-11-18 against `src/mortgage.ts`, `src/tax.ts` and `src/storage.ts`. No project source files were changed.

**How sure each finding is:**
- **High:** taken directly from a primary source I read: Freddie Mac PMMS, the Homeowners Protection Act text (12 U.S.C. §4901–4902), the Oregon DOR *Property Tax Statistics FY 2025-26* PDF, and the City of Vancouver.
- **Medium-high:** Tax Foundation figures. I read its 2026 page through a summarizing fetch tool, not as raw tables. Spot-check the exact numbers before you ship them.
- **Medium:** market figures (home prices, insurance), which come from secondary aggregators. RMLS's own report was not accessible to me.

## Summary

| # | Item | Current value | Verified value | Source (date) | Verdict |
|---|------|---------------|----------------|---------------|---------|
| 1 | P&I formula (incl. 0%) | standard annuity formula; `P/n` at 0% | Correct. $320k at 6.5%/30y = $2,022.62 | Standard formula; checked numerically | **OK** |
| 2 | PMI cancellation | Stops when *actual* balance ≤ 78% of price | HPA: automatic stop at 78% on the *original schedule*; stop on request at 80% (schedule **or** actual payments); final stop at the loan midpoint | [12 U.S.C. §4901](https://www.law.cornell.edu/uscode/text/12/4901), [§4902](https://www.law.cornell.edu/uscode/text/12/4902) | **adjust** (wording + logic) |
| 3 | PMI convention / rate | 0.5%/yr of original loan | Convention correct. Typical range 0.46–1.50%/yr (Urban Institute); Freddie Mac: $30–70/mo per $100k (≈0.36–0.84%) | [Bankrate/Urban Inst., Aug 2026](https://www.hawaiinewsnow.com/bankrate-article/2026/08/11/pmi-got-you-into-your-home-it-shouldnt-overstay-its-welcome/); [Freddie Mac MyHome](https://myhome.freddiemac.com/buying/breaking-down-pmi) | **OK** (low end; see note) |
| 4 | Other modeling | — | No bugs found; a few simplifications to note | Code review | **OK** |
| 5a | Oregon statewide rate | 0.83% | **0.81%** (2024 ACS); 0.83% was the 2023 figure | [Tax Foundation, Mar 16 2026](https://taxfoundation.org/data/all/state/property-taxes-by-state-county/) | **adjust** (minor) |
| 5b | Washington statewide rate | 0.80% | **0.75%** (2024 ACS); 0.77% (2023) | same | **adjust** |
| 6 | Portland-metro counties | (statewide only) | Multnomah 1.02%, Washington 0.86%, Clackamas 0.84%, Clark WA 0.77% (ACS 2024 5-yr). DOR all-property: Multnomah 1.20%, Washington Co. 1.05%, Clackamas 1.00% of RMV | Tax Foundation (above); [OR DOR FY 2025-26, Exh. 6b](https://www.oregon.gov/dor/programs/gov-research/Documents/FY%202025-26%20Oregon%20Property%20Tax%20Statistics%20Report-UA.pdf) | **adjust** for Multnomah |
| 7 | "% of price" model in Oregon | flat % of purchase price | Oregon tax is tied to the assessed value (AV) the seller already had, not to the price paid. A Portland home's tax can be anywhere from about 0.5% to over 2% of price; Multnomah averages about 1.0–1.2% | OR DOR FY 2025-26 report | **adjust** (add a $ override / Portland default) |
| 8 | ZIP prefixes | 970–979 OR, 980–994 WA | Correct; Portland metro (970–972) → OR and Vancouver (986) → WA both map correctly. No errors found in the other ranges | USPS 3-digit assignments (from memory, not fetched) | **OK** |
| 9 | National average | 0.90% | **0.89%** ($8.88 per $1,000; 2024 ACS, aggregate method) | [NAHB Eye on Housing, Nov 2025](https://eyeonhousing.org/2025/11/property-taxes-by-state-2024/) | **OK** |
| 10 | Other state rates | various | Mostly 0.05–0.2 points higher than the 2024 data (looks like a ~2021–22 vintage). Largest gaps: NJ, CT, NY, IA, KS, WI, NH, AK | Tax Foundation, Mar 2026 | **adjust** (refresh) |
| 11 | Insurance | $1,800/yr | Portland **$1,850/yr** ($500k dwelling coverage); Oregon $2,065/yr | [NerdWallet, upd. Feb 20 2026](https://www.nerdwallet.com/insurance/homeowners/oregon-home-insurance) | **OK** |
| 12 | Interest rate | 6.5% | **7.11%** 30-yr fixed (week of Nov 12, 2026); 15-yr 6.45% | [Freddie Mac PMMS](https://www.freddiemac.com/pmms) | **adjust** |
| 13 | Home price | $400,000 | Portland metro median **$545,000** (Sept 2026, RMLS via secondary source) | [Cano Real Estate, Oct 2026 report](https://www.canorealestate.com/portland-metro-real-estate-market-report/) | **adjust** if the site is Portland-focused |

---

## 1. Monthly P&I formula — OK

`monthlyPI` uses the standard formula `P·r / (1 − (1+r)^−n)` with `r = rate/12`, `n = years·12`, and falls back to `P/n` when `r === 0`. Both are correct. A numeric check gives $320,000 at 6.5% over 30 years = **$2,022.62/mo**, which matches published amortization tables. Zero or negative principal and `n ≤ 0` return 0, which is safe.

## 2. PMI cancellation vs. the Homeowners Protection Act — adjust

What the statute says (12 U.S.C. §4901, definitions, read directly):

- **Cancellation date** (the borrower asks): the date the balance is first scheduled to reach **80% of original value**, "based solely on the initial amortization schedule", **or** the date it "based solely on actual payments, reaches 80 percent of the original value". Extra payments count here. The borrower must also send a written request, have a good payment history, and may have to show the value hasn't fallen and that there are no second liens (§4902(a)).
- **Termination date** (automatic): the date the balance is "first scheduled to reach **78 percent** of the original value", "based solely on the initial amortization schedule … *irrespective of the outstanding balance*". Extra payments do **not** speed this up. The borrower must be current on payments.
- **Final termination** (§4902(c)): PMI can't be charged past the month after the **midpoint of the amortization period** (year 15 of a 30-year loan).
- **Original value** = the lesser of the contract sales price and the appraised value. Using `homePrice` is fine.
- The "high-risk loan" exception (§4902(g), 77%) doesn't apply to a general calculator.

What the code does: it charges PMI while the *actual* balance at the start of the month is above 78% of price. That blends the two rules:

- **Without extra payments,** the actual balance equals the scheduled balance, so the result matches the automatic-termination rule exactly. **Correct.**
- **With extra payments,** the code ends PMI when the actual balance reaches 78%. That is neither rule. Automatic termination wouldn't happen yet, because the schedule hasn't reached 78%. But the borrower could already have *requested* cancellation at 80% of actual balance, which is earlier. So the code is **too late** for a borrower who asks, and **too early** for one who doesn't. In dollar terms it is a modest, conservative simplification, but the comment "auto-cancels at 78% LTV" is wrong whenever extra payments are present.
- **Midpoint:** the code never applies it. With a 30-year term, my calculation shows the 78% scheduled date comes first in every realistic case: month 144 at 6.5% with 3% down, month 163 at 8% with 3% down, both before month 180. The midpoint matters only at very high rates or with unusual terms. It's cheap to add.

**Recommendation (pick one):**

- **(a) Wording only (minimum).** Change the comment and any UI text to: *"PMI ends when your balance reaches 78% of the original price (automatic, on the original schedule) or 80% if you ask your lender. This calculator drops PMI at 78% of your actual balance, including extra payments."*
- **(b) Logic (better).** Compute a PMI end month as the **earliest** of:
  1. the first month the **baseline (no-extra) schedule** balance is ≤ 78% × price (automatic);
  2. the first month the **actual** balance is ≤ 80% × price (on request; label it in the UI as "if you request cancellation");
  3. `termYears * 12 / 2` (midpoint).

  Optionally add a toggle, "I'll request PMI cancellation at 80%", that turns item 2 on or off.

## 3. PMI convention and 0.5% default — OK (on the optimistic side)

- **Convention:** for standard borrower-paid monthly PMI, the premium is quoted as an annual % of the **original loan amount** and stays the same until cancellation. That's what the code does. **Correct.**
- **Typical cost:**
  - Urban Institute (cited by Bankrate, Aug 11 2026): **0.46%–1.50%/yr** of the original loan. Scores of 760+ sit near the low end; scores of 620–639 near the high end.
  - Freddie Mac's consumer site: **$30–$70/mo per $100,000** borrowed, about 0.36%–0.84%/yr.
  - I found no official 2026 rate card. MI company rate cards (MGIC, Radian, Essent, etc.) aren't publicly summarized, and the grids on aggregator sites contradict each other.
- **Verdict:** 0.5% is reasonable for a buyer with very good credit (740+) and 10–15% down. It understates cost for 3–5% down or scores under 700, where 0.8–1.5% is common. Keep 0.5% or raise it to about 0.6%, and add helper text: *"Typically 0.3%–1.5% depending on credit score and down payment."*

## 4. Other modeling checks — OK, with notes

- **Exactly 20% down:** I tested every whole-dollar price from $100k to $1M with `price*20/100` and `price*0.2`. None produced LTV > 0.8 through floating-point error, so PMI is never wrongly applied at 20% down.
- **Extra payments:** `extra = min(extraMonthly, balance − principal)` correctly caps the final extra payment. The baseline schedule is rebuilt without extras. Correct.
- **Final payment:** `principal = min(basePI − interest, balance)` makes the last payment smaller instead of overpaying. Correct. The loop stops at `maxMonths` or when the balance is ≤ $0.005, so leftover floating-point dust can't add an extra month.
- **Rounding:** nothing is rounded to the cent. Real servicers round the payment and interest each month, so lifetime totals can differ by a few dollars. That's cosmetic; mention it in a footnote if you like.
- **PMI timing:** PMI for month *m* is based on the opening balance, so the first payment that brings the balance to ≤ 78% still includes PMI. That matches how servicers bill, so it's fine.
- **Simplifications** (not bugs; worth a footnote):
  - Property tax and insurance stay flat for the whole loan (no escalation).
  - "Total PMI" assumes the borrower never refinances or requests early cancellation.
  - `monthly.pmi` shows only the first month's PMI, which is the right thing for a headline number.

## 5. Oregon and Washington statewide rates — adjust (small)

Tax Foundation, *Property Taxes by State and County, 2026* (published Mar 16 2026). It uses 2024 ACS data: real estate taxes paid as a % of owner-occupied home value.

| State | Code | 2024 ACS | 2023 ACS | Rank 2024 |
|---|---|---|---|---|
| Oregon | 0.83 | **0.81%** | 0.83% | 24 |
| Washington | 0.80 | **0.75%** | 0.77% | 30 |

The code's Oregon value matches the previous edition. The Washington value (0.80) matches neither edition and is about 0.05 points high. A different method (ACS table S2506, mortgaged homes only; Motley Fool, 2024 ACS) gives OR 0.77% / WA 0.77%, so the exact figure depends on the source. Pick one source and cite it in the code comment.

## 6. Portland-metro county rates — Multnomah is notably higher

Two independent measures:

| County | ACS 2024 5-yr (Tax Foundation) | Median home value | Median tax | DOR FY 2025-26: tax ÷ RMV (all property) | DOR: tax ÷ AV |
|---|---|---|---|---|---|
| Multnomah (Portland) | **1.02%** | $552,700 | $5,301 | **1.20%** ($12.03/$1k) | 2.36% |
| Washington Co. (Beaverton/Hillsboro) | 0.86% | $588,000 | $4,929 | 1.05% ($10.54/$1k) | 1.80% |
| Clackamas | 0.84% | $611,000 | $5,171 | 1.00% ($9.99/$1k) | 1.79% |
| Oregon statewide | 0.81% | — | — | 0.94% ($9.40/$1k) | 1.75% |
| Clark Co., WA (Vancouver) | 0.77% | $522,900 | $4,290 | n/a | n/a |

- **ACS** figures are owner-reported taxes and values. They tend to run low because owners' value estimates lag the market and some owners report taxes incorrectly.
- **DOR** figures include *all* property classes (commercial, multifamily and so on), so they aren't a pure homeowner rate. They are the official imposed-tax totals, though.
- **Vancouver, WA** (City of Vancouver, 2025): median home value $489,995 (Dec 2025); levy $9.69 per $1,000 (Vancouver SD) or $10.10 (Evergreen SD); median tax $4,746–$4,948. That works out to roughly **0.97–1.0%** of value. Washington assesses close to market value every year, so the levy rate is a good stand-in for tax as a % of price there. The ACS 0.77% looks low for a new Clark County buyer.

**Difference from the statewide figure:**
- Multnomah runs **0.2–0.4 points above** Oregon's statewide figure. On a $545k home that's $5,559–$6,540/yr instead of $4,524 at 0.83%, an understatement of roughly **$85–$170/mo**.
- Washington County and Clackamas are within about 0.05 points on the ACS basis.
- Clark County: the code's 0.80% is close to ACS but probably low for a buyer today (about 0.97% per the city's figures).

## 7. Measure 5 / Measure 50 and what a new buyer pays — the flat-% model is unreliable in Oregon

How it works (Oregon DOR FY 2025-26 report, Section III):

- **Assessed value (AV)** = the lower of maximum assessed value (MAV) and real market value (RMV). Measure 50 reset MAV to 90% of 1995-96 RMV, and MAV can grow **no more than 3%/yr** unless there are new improvements, a rezoning and so on.
- **A sale does not reset AV.** The buyer inherits the seller's MAV. This is the opposite of California's Prop 13.
- **New construction:** MAV = RMV × the county's **changed property ratio (CPR)**, which is the average MAV/RMV of existing property of the same class. New homes therefore come in near the county's average ratio. I could not retrieve the current Multnomah residential CPR; the county's page uses 0.481 only as an illustration.
- **Measure 5** caps *operating* taxes at $5 per $1,000 of RMV for schools and $10 per $1,000 for general government. Bonds are excluded. Where a property's bill would exceed the cap, it is "compressed".
- In Multnomah, total AV is about **51% of RMV** ($105.7B ÷ $207.6B, DOR Exhibit 6a). Washington Co. is about 58%; Clackamas about 56%.

What this means for a buyer's tax as a % of purchase price ≈ (the home's own AV ÷ price) × (the local tax rate per $1,000 of AV):

- In Portland, levy rates per $1,000 of AV are high (county average $23.63/$1k). AV/RMV varies a lot from house to house: very low in inner neighborhoods that have appreciated fast, higher in outer east Portland. So two homes sold at the same price can have tax bills that differ by thousands of dollars.
- **Over or under?** On average, a statewide 0.81–0.83% **underestimates** tax for a Portland (Multnomah) buyer, whose average is about 1.0–1.2%. For an individual house it can be wrong in either direction: about 0.6% for a high-value inner-eastside home, 1.5–2%+ for homes whose AV is close to RMV. In Washington and Clackamas counties the statewide figure is close on average, with the same variation per house.
- **The most accurate input for an existing Oregon home is the current tax bill in dollars.** It appears on every listing and on PortlandMaps / the county assessor's site, and the buyer will inherit it (plus about 3%/yr). A % of price is only a fallback.

**Suggested defaults:**
- **Portland (Multnomah) ZIPs: about 1.15%.** Between the ACS 1.02% (runs low) and the DOR all-property 1.20%, and in line with a real $625k Portland estimate of $600/mo (1.15%).
- **Washington and Clackamas County ZIPs:** keep about 0.85%.
- **Caveat:** 3-digit prefixes don't line up with counties. 972xx is mostly Multnomah but includes Washington County ZIPs such as 97223, 97224, 97225 and 97229, and 970xx spans several counties. A small 5-digit override table for the Multnomah ZIPs (97201–97220, 97227, 97230, 97232, 97233, 97236, 97239, 97266, plus Gresham 97030/97080, etc.) is more accurate than a prefix rule. Verify that list against USPS/county data before using it; I did not fetch a ZIP-to-county file.

## 8. ZIP prefixes — OK

970–979 → OR and 980–994 → WA are correct, so Portland metro (970–972 → OR) and Vancouver / Clark County (986xx → WA) map correctly.

I also checked the rest of `PREFIX_RANGES` against USPS 3-digit assignments, from memory rather than a fetched file. The special cases are all handled correctly: 005 NY (Holtsville IRS), 055 MA, 201 VA, 202–205 DC, 398–399 GA, 569 DC, 733 TX, 885 TX (El Paso), 967–968 HI.

Gaps return `null`, which is the right behavior. They are:
- 006–009: Puerto Rico / U.S. Virgin Islands
- 090–099, 340, 962–966: military APO/FPO
- 969: Guam / Pacific territories

The one minor issue is that 340 (APO AA) falls inside the 320–349 range and returns FL. That's harmless.

Some 5-digit ZIPs cross state lines (e.g. 97635 New Pine Creek OR/CA), which no 3-digit approach can catch. Acceptable.

## 9. National average — OK

NAHB's analysis of 2024 ACS data (aggregate taxes ÷ aggregate owner-occupied value): **$8.88 per $1,000 = 0.89%**. 0.9% is a fine rounding. The Tax Foundation doesn't publish a national figure. The unweighted mean of state rates is also about 0.9%, but that is my calculation.

## 10. Other state rates — refresh recommended

Code vs. Tax Foundation 2024 ACS (2023 in parentheses):

| State | Code | 2024 (2023) | Gap |
|---|---|---|---|
| NJ | 2.08 | 1.88 (1.98) | −0.20 |
| CT | 1.70 | 1.54 (1.62) | −0.16 |
| KS | 1.34 | 1.21 (1.22) | −0.13 |
| AK | 1.04 | 0.94 (0.95) | −0.10 |
| IA | 1.43 | 1.33 (1.36) | −0.10 |
| NY | 1.40 | 1.30 (1.31) | −0.10 |
| NH | 1.61 | 1.50 (1.62) | −0.11 |
| WI | 1.43 | 1.32 (1.39) | −0.11 |
| PA | 1.35 | 1.26 (1.31) | −0.09 |
| IL | 1.95 | 1.88 (1.91) | −0.07 |
| TX | 1.47 | 1.40 (1.47) | −0.07 |
| VT | 1.62 | 1.51 (1.58) | −0.11 |
| CA | 0.71 | 0.70 (0.70) | OK |
| CO | 0.49 | 0.50 | OK |
| AL | 0.38 | 0.37 | OK |
| HI | 0.27 | 0.29 (0.30) | OK |
| GA | 0.83 | 0.79 (0.82) | small |
| VA | 0.75 | 0.78 | small |
| OH | 1.36 | 1.36 (1.41) | OK |
| NE | 1.50 | 1.44 (1.48) | small |

Nothing is wildly wrong; there are no swapped states or misplaced decimals. The table just looks a few years old, and rates have generally fallen as home values rose faster than levies. I would replace the whole `STATES` table with the Tax Foundation 2026 edition (2024 ACS) in one pass and put the source and year in the file comment. I only spot-checked the states listed above.

## 11. Home insurance — OK

- NerdWallet (updated Feb 20 2026), sample policy with $500k dwelling coverage, $300k liability and a $1,000 deductible: **Portland $1,850/yr**, Oregon average **$2,065/yr**.
- Other estimates: Insure.com about $1,544 for $300k dwelling coverage; MoneyGeek about $1,124 for Oregon. Methods differ.
- $1,800 fits a Portland-median-priced home. Keep it, or use $1,850 to match the source. If the default price moves to about $545k, $1,800–1,900 is still consistent.

## 12. Interest rate — adjust

Freddie Mac PMMS for the week of **Nov 12, 2026**: **30-yr fixed 7.11%** (down from 7.18% on Nov 5; the 4th weekly decline in a row; 6.24% a year earlier). 15-yr fixed: 6.45%. The next PMMS release is Thu Nov 19, so check for a newer number before shipping.

6.5% is about 0.6 points below the market. On a $320k loan, P&I would be $2,152.66 instead of $2,022.62, about $130/mo more.

## 13. Home price — adjust if the site targets Portland

- RMLS Portland-metro median sale price: **$545,000** in Sept 2026 (flat month over month, +0.9% year over year), per Cano Real Estate's Oct 2026 report. Earlier months: Jun $564,900, Jul $555,000. Year-to-date median about $549,900 (Lovejoy Real Estate).
- City-of-Portland-only figures are lower: Portland Homes Guide reports about $513k over the last 12 months.
- I could not open RMLS's own Market Action Report (it is distributed through members), so these are **secondary** citations.
- A $545k home with 20% down at 7.11% gives P&I of about $2,933/mo.

---

## Recommended changes

1. **`src/storage.ts` → `DEFAULT_STATE`**
   - `annualRate`: stays a **static** default; no live rate feed (decided 2026-11-18). Either keep `6.5` or bump to `7.1` (PMMS 30-yr avg, 2026-11-12) with a comment noting the date. Users can override it.
   - `homePrice: 400_000` → **`545_000`** if the site is Portland-focused (RMLS metro median, Sept 2026). Otherwise keep it as a national default.
   - `insuranceAnnual: 1_800` → keep, or `1_850` (NerdWallet Portland, Feb 2026).
   - `pmiRate: 0.5` → keep (or `0.6`) and add UI helper text: *"Typically 0.3%–1.5%/yr depending on credit score and down payment."*
   - `taxRate: 0.9` → keep (matches the national 0.89%).

2. **`src/tax.ts`**
   - `OR: ["Oregon", 0.83]` → **`0.81`**.
   - `WA: ["Washington", 0.8]` → **`0.75`**.
   - Refresh the whole `STATES` table from the Tax Foundation, *Property Taxes by State and County, 2026* (2024 ACS), and update the header comment to name the source and data year.
   - `NATIONAL_AVERAGE_RATE = 0.9` → keep. Optionally cite "NAHB, 2024 ACS, 0.89%".
   - Add an optional 5-digit override for Multnomah County (Portland) ZIPs at **~1.15%**, checked before the prefix lookup. The ACS figure (1.02%) runs low. The user's real estimate for a $625k Portland home ($600/mo = $7,200/yr = 1.15%) matches the DOR all-property figure (1.20%), so use the higher end. Example:
     ```ts
     // Multnomah County (Portland): ACS 2024 1.02%, OR DOR FY25-26 1.20%; real quotes ~1.15%
     const ZIP_OVERRIDES: Record<string, number> = { "97201": 1.15, "97202": 1.15, /* … verify list … */ };
     ```
     Verify the ZIP list against a ZIP-to-county file first; 972xx includes Washington County ZIPs.
   - Optionally, a Clark County (986xx) override of about 0.95%, based on City of Vancouver 2025 levies of $9.69–$10.10 per $1,000.

3. **Manual property tax override in an "Advanced" section** (user request, 2026-11-18). Put a manual property tax rate (%) input in a collapsible Advanced section. When it's filled in, it replaces the ZIP-based rate. `FormState` already has `taxRateAuto` / `taxRate`, so wire the UI to those rather than adding new state. Optionally offer a $/yr mode as well.

4. **Oregon UI note.** When the ZIP resolves to OR, show: *"In Oregon, taxes are based on the home's assessed value, which does not reset when it sells, so the tax can be far above or below this estimate. Use the current tax bill from the listing or PortlandMaps for an accurate number."* Ideally, also add a "property tax: $/yr" input mode alongside the % of price.

5. **`src/mortgage.ts` PMI**
   - Fix the `PMI_CANCEL_LTV` comment: "auto-cancels at 78% LTV" is accurate only without extra payments.
   - Better: end PMI at the earliest of (a) the baseline-schedule balance ≤ 78% × price, (b) the actual balance ≤ 80% × price (borrower request; make it a UI toggle), and (c) `termYears*12/2`. See §2.

6. **Footnotes worth adding to the UI:** tax and insurance are held flat (no escalation); amounts aren't rounded to the cent; total PMI assumes no refinance.
