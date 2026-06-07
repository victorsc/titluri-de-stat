# Missing / Unmatched Emission Codes — Fidelis Secondary Market

Research conducted 2026-05-18. Updated when new bonds are added.

---

## Summary

The screener matches secondary-market bond symbols from `fidelis_yields.json` to emission records in
`fidelis.json` to display an "Emisă" (issue month/year) column.  
**118/119 issued symbols** resolve successfully. One remains unmatched.

---

## Match algorithm

For each symbol in `fidelis_yields.json` (`_issued: 1`):

1. Infer preferred source array from symbol suffix:
   - `A` → `fidelis.json → ron`
   - `AE`, `CE` → `fidelis.json → eur`
   - `B`, `D` → `fidelis.json → donatori.ron`
   - `BE` → `fidelis.json → donatori.eur`
2. For each entry in the source array, compute `expected_maturity = issue_date + m years`.
3. Find the entry with `|actual_maturity − expected_maturity| ≤ 2 months`.
4. If found, display the emission label (e.g., "Aug 2024"); otherwise display "—".

---

## Donor bond series (B / BE / D suffix)

Blood-donor Fidelis bonds are a premium series issued monthly since **June 2025**,
with ~1% higher coupon than standard bonds. They trade on BVB like regular Fidelis bonds.

The scraper already captures them under `fidelis.json → donatori` (both `ron` and `eur`).
Symbols follow the pattern `R{YYMM}B` (RON), `R{YYMM}BE` (EUR), `R2712D` (December 2025 RON).

All donor bonds match successfully once the lookup restricts to the `donatori` arrays.

**Donor bonds currently in the secondary market screener:**

| Symbol   | Currency | Matures     | Coupon | Issue (approx.) |
|----------|----------|-------------|--------|-----------------|
| R2612BE  | EUR      | 2026-12-23  | 3.75%  | Dec 2024        |
| R2706B   | RON      | 2027-06-19  | 8.35%  | Jun 2025        |
| R2707B   | RON      | 2027-07-16  | 8.25%  | Jul 2025        |
| R2707BE  | EUR      | 2027-07-16  | 4.40%  | Jul 2025        |
| R2708B   | RON      | 2027-08-13  | 8.20%  | Aug 2025        |
| R2708BE  | EUR      | 2027-08-13  | 4.10%  | Aug 2025        |
| R2709B   | RON      | 2027-09-17  | 8.20%  | Sep 2025        |
| R2709BE  | EUR      | 2027-09-17  | 4.10%  | Sep 2025        |
| R2710B   | RON      | 2027-10-22  | 8.20%  | Oct 2025        |
| R2711B   | RON      | 2027-11-19  | 7.95%  | Nov 2025        |
| R2712B   | RON      | 2027-12-23  | 7.90%  | Dec 2025        |
| R2712D   | RON      | 2027-12-17  | 7.55%  | Dec 2025        |
| R2801B   | RON      | 2028-01-28  | 7.45%  | Jan 2026        |
| R2802B   | RON      | 2028-02-18  | 7.15%  | Feb 2026        |
| R2803B   | RON      | 2028-03-18  | 6.90%  | Mar 2026        |
| R2804B   | RON      | 2028-04-24  | 7.60%  | Apr 2026        |

`R2712D` is the standalone December 2025 donor bond (code "D" = one-off series).

---

## C / CE suffix bonds

A third emission series (`C` = third tranche of a given maturity month).  
Same risk/tax profile as `A`/`AE` bonds; coupon differs because they were issued in a
different market environment. The lookup handles them identically to `A`/`AE` (matched
against `ron` / `eur` arrays) and all resolve successfully.

---

## Unresolved bond

### R2804AE — EUR, matures 2028-04-13

This EUR bond does not match any entry in `fidelis.json → eur`:

| Possible duration | Would imply issue date | In fidelis.json eur? |
|-------------------|------------------------|----------------------|
| 5Y                | Apr 2023               | **No** (no Apr 2023 EUR entry) |
| 4Y                | Apr 2024               | **No** (Apr 2024 has m:1 and m:5 only, no m:4) |
| 3Y                | Apr 2025               | **No** (Apr 2025 has m:2 and m:7 only) |

**Most likely explanation:** a 4-year EUR tranche emitted in April 2024 that was not
captured by the scraper because it was a supplementary auction or re-opening not listed
in the main fidelis.ro/emisiuni table. 

**Action needed:** manually check the Ministerul Finanțelor historical issuances for
April 2023 and April 2024 EUR Fidelis series to confirm the issue date, then either:
- Add a missing entry to `data/fidelis.json` if the scraper missed it, or
- Add a hardcoded entry in the `buildEmissionMap()` function in `piata.js`.

Until resolved, this symbol displays "—" in the Emisă column.

---

## Date offset note

Settlement date for Fidelis bonds is typically T+2 or T+3 after subscription close.
This means the maturity date (encoded in the symbol) can be 1–2 months later than
the subscription month recorded in `fidelis.json`.  
The matching algorithm uses a ±2-month tolerance to account for this offset.
