# Missing / Unmatched Emission Codes — Fidelis Secondary Market

Research conducted 2026-05-18; history audited against BVB press releases 2026-10-17.

---

## Summary

The screener matches secondary-market bond symbols from `fidelis_yields.json` to emission records in
`fidelis.json` to display an "Emisă" (issue month/year) column.  
**158/158 issued symbols** (Oct 2026) resolve to an emission whose rate equals their coupon.

---

## Match algorithm

For each symbol in `fidelis_yields.json` (`_issued: 1`):

1. Consider only emissions in the bond's currency (`ron` + `donatori.ron`, or `eur` + `donatori.eur`)
   whose `issue_date + m years` is within 2 months of the actual maturity.
2. Prefer an entry whose rate `r` equals the bond's `Coupon`. Several tranches often mature in the
   same month (e.g. `R2802C`: Feb 2026, 2y, 6.15% vs. the Feb 2025 3y bond), so the coupon is
   what tells them apart.
3. Otherwise fall back to the closest maturity in the array suggested by the suffix:
   `A`/`C` → `ron`, `AE`/`CE` → `eur`, `B`/`D` → `donatori.ron`, `BE` → `donatori.eur`.
   The suffix is only a tranche sequence letter, not a reliable donor flag: in Dec 2023,
   `R2412B` was the donor bond but `R2412BE` was a regular EUR bond.
4. Display the emission label (e.g. "Aug 2024"), or "—" if nothing matches.

---

## Donor bond series

Blood-donor tranches carry ~1pp more than the matching standard tranche.
- **RON:** every offer since **Mar–Apr 2023** (Fidelis XI) has had one; 1y until 2024, 2y since Jun 2025
  (Dec 2024 also had a 3y donor tranche, R2712B).
- **EUR:** only since **Jul 2025** (R2707BE). Earlier `BE` symbols (R2404BE, R2410BE, R2412BE,
  R2508BE, R2612BE) are regular EUR bonds; `B` there is just the second tranche maturing that month.
- `R2712D` is a one-off December 2025 donor RON bond.

The market page takes the "Donatori" badge from the `donatori` array a bond matched in; the
suffix is only a fallback for bonds with no match (e.g. upcoming ones).

---

## C / CE suffix bonds

`C` is the third tranche maturing in a given month (e.g. R2802C, Feb 2026 2y, alongside R2802A,
Feb 2025 3y, and R2802B). The coupon is what tells these apart.

---

## History sources and known errors

Entries before Jun 2026 were not scraped live. When correcting them:
- **Use BVB press releases** ("Comunicat de presa … Fidelis …" / "Anunt Fidelis …" on bvb.ro):
  each has a tranche table with symbol, maturity date and rate.
- **fidelis.ro/istoric-complet-fidelis has wrong section headings**: its "Dec 2022" block is the
  Apr 2023 offer, its "Dec 2023" block mixes in Mar 2024 bonds, and it lists some donor and
  regular rates under swapped symbols. Trust the symbols, not the headings: `RYYMM` is the
  maturity month, so issue month = maturity − term.
- `fidelis_yields.json` coupons are authoritative for every bond still listed; the matcher
  should find an exact-coupon emission for each one.

The Mar–Apr 2023 offer (subscription 27 Mar–10 Apr, issued 13 Apr) is labelled `Apr 2023`.

---

## Date offset note

Settlement date for Fidelis bonds is typically T+2 or T+3 after subscription close.
This means the maturity date (encoded in the symbol) can be 1–2 months later than
the subscription month recorded in `fidelis.json`.  
The matching algorithm uses a ±2-month tolerance to account for this offset.
