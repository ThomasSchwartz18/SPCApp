# MOAT False Call Rate Analysis

This report analyzes the `moat` table in `spcapp.db` to identify models with high false-call activity.

## Method
1. Calculate the ratio `falsecall_parts / ng_parts` for each `moat.model_name` (ignoring rows where `ng_parts` is 0).
2. Rank models by this ratio and flag those with a ratio greater than **100**.
3. For flagged models, attempt to match the model's assembly number to AOI reports to gather operator and shift context.

All queries were run on the provided SQLite database on 2025-08-11.

## Top Models by False-Call Ratio

| Rank | Model Name | False-call/NG Ratio |
| ---- | ---------- | ------------------ |
| 1 | JP124LF Rev 09 Bottom (SMT) | 3398.00 |
| 2 | 603628LF Rev F Bottom | 2670.00 |
| 3 | 18-0077-01LF Rev R Top (SMT) | 1865.00 |
| 4 | HH6420LF Rev C Top (SMT) | 1659.09 |
| 5 | 603588LF Rev A Top (SMT) | 1490.50 |
| 6 | 603520LF Rev L Bottom (SMT) | 1370.00 |
| 7 | A729000 2000LF Rev 008 Top (SMT) | 1222.86 |
| 8 | 4267-0511 Rev 0 Top (SMT) | 1140.00 |
| 9 | 11000419-04 Rev A Top (SMT) | 1133.00 |
| 10 | 626810LF Rev C Top (SMT) | 1103.00 |

A total of **89** models exceeded the threshold of 100.

## AOI Operator and Shift Cross-Reference

Flagged models were compared with AOI reports by matching the base assembly code. This produced AOI matches for **35** flagged assemblies.

**Operator involvement (number of flagged assemblies):**

- Kurt Tipton – 19
- Carissa Schwartzburg – 15
- Traci Wells – 15
- Trey Rust – 13
- Jeff Burns – 13
- Jacob Gregory – 9
- Thomas Schwartz – 5
- Joshua Alexander – 5
- Cody Little – 1
- Meghann Donaldson – 1

**Shift distribution of flagged assemblies:**

- 1st shift – 32 assemblies
- 2nd shift – 21 assemblies

## Observations

- The highest ratios occur on assemblies inspected by multiple operators across different shifts, suggesting assembly-specific causes rather than a single operator issue.
- 1st shift accounts for more flagged assemblies than 2nd shift (32 vs 21), which may warrant further review of staffing or procedures during 1st shift.
- Operators Kurt Tipton and Carissa Schwartzburg appear on the most flagged assemblies, indicating possible training or workflow review opportunities.

These findings should assist in directing process-improvement discussions toward assemblies and operational contexts with the greatest false-call burden.

