# Plan: Social Security from your earnings record

## Summary

The user pastes their earnings record from ssa.gov. The app calculates their
Social Security benefit and adds it to the plan as income after tax. The
benefit depends on the retirement year: each year you stop working early is
a year that is not in your best 35 years. In "when ready" plans, each
simulated future retires in a different year, so each future gets the
benefit for its own retirement year.

Why: today, the user must type Social Security as "other income" with an
amount and a start date. The user must find the amount on ssa.gov, and that
amount assumes that you work until full retirement age at your current pay.
For a person who retires early, which is the audience of this app, that
amount is too high. Also, the amount does not change when the retirement
year changes.

The benefit math and the earnings paste come from ssa.tools
(`Gregable/social-security-tools`, MIT license, forked to
`jmangel/social-security-tools`). Keep its license notice in each file we
port from it.

## Decisions

### 1. A new "Social Security" settings tab

The tab goes after "Income". The paste flow and the earnings table are too
large for an income row. On the Income tab, a read-only row "Social Security
(calculated)" shows the amount and links to the tab.

> **Social Security**
> [ ] Include Social Security
>
> Birth date [____]
>
> **Your earnings record**
> 1. Sign in to ssa.gov and open your earnings record (link).
> 2. Select the whole table and copy it.
> 3. Paste it here: [ paste box ]
>
> [ table: Year · Earnings · Source ]
>
> **When you claim**
> ( ) When I retire, but not before age [62] *(default)*
> ( ) At age [67] years [0] months
>
> Tax on benefits [10]%
> Benefits paid from 2034: [100]% of the scheduled amount

- **Include Social Security** is off in new plans and in old files. With it
  off, the results do not change. Conservative users can keep it off.
- **Birth date.** The app has no ages today. Social Security needs the birth
  date for age 62, full retirement age (67 for people born in 1960 or later),
  age 70, and the indexing year (the year you turn 60). Use the SSA rule
  that a person born on the 1st of a month is a month older
  (`birthday.ts` in ssa.tools).
- **The paste box** accepts the same formats as ssa.tools: the ssa.gov
  earnings page, two columns from a spreadsheet (year, earnings), and the
  table of this app. Port `ssa-parse.ts` and its test pastes.
- **Privacy.** The text under the paste box says: "Your earnings record stays
  on this device. It is saved with this scenario and is in backups that you
  export."

### 2. Gross wages on each income row

Each income row gets an optional field: **Gross wages subject to Social
Security** (per year). It is next to the after-tax amount.

Help text: "Your pay before tax, including 401(k) contributions, but not
health insurance or HSA amounts taken from your pay before tax. If you are
self-employed, use 92.35% of your net earnings. Leave it blank for pensions,
rent, and jobs that do not pay Social Security tax (for example, some
government jobs)."

- A blank field is 0.
- The field uses the dates of its row. Thus, job changes, jobs that start in
  the future, and part-time work after retirement are correct.
- The field uses the "adjust for inflation" setting of its row.
- Each year is capped at the SSA taxable maximum for that year.
- If Social Security is on and no row has gross wages, the tab shows a
  warning: "No future earnings. The benefit uses only your record."

### 3. Estimated years in the earnings table

The record on ssa.gov does not include this year. Often it does not include
last year either ("Not yet recorded"). For these years, the app makes an
estimate from the income rows: the sum of each row's gross wages multiplied
by the fraction of the year in which the row is active
(`fractionOfYearActive`). A row that starts in the future adds 0. Most rows
are active for the full year, so the estimate is the full year's wages.

The table shows a source for each year:

| Source | Meaning |
|---|---|
| ssa.gov | From the pasted record. |
| Estimated from your income | Made from the income rows. Editable. |
| Entered by you | An estimate that the user changed. "Reset to estimate" undoes it. |

- An edited value stays when the income rows change.
- A new paste replaces estimates and edits for the years that it includes.
- A recorded year that is much lower than the year before it gets a warning:
  "This year may not be complete yet."
- Years after this year are not in the table. The engine calculates them
  from the income rows for each retirement year (see "Engine").

### 4. When you claim

Two rules:

- **When I retire, but not before age X** (default X = 62). The claim date is
  the later of the retirement date and age X. It is never later than age 70,
  because the benefit does not grow after 70. In "when ready" plans, each
  future claims at a different age.
- **At age X** (years and months, from 62 to 70).

The benefit at the claim date uses the SSA rules: a reduction of 5/9 of 1%
for each month before full retirement age (up to 36 months) and 5/12 of 1%
for each month after that; a credit of 2/3 of 1% for each month after full
retirement age, up to age 70.

**Earnings test (approximation).** With "At age X", a future can claim
before full retirement age while it still works. SSA then holds back
benefits and increases the benefit at full retirement age to make up for
it. The app does not model this. Instead, it pays nothing until the earlier
of retirement and full retirement age, and calculates the benefit as if the
user claimed then. The "When I retire" rule never has this problem.

**Too few credits.** A person needs 40 credits (about 10 years of work) to
get a benefit. If a future retires before it has 40 credits, its benefit is
0. Young early retirees can have this result, so the results say it.

### 5. Tax

**Tax on benefits**, default 10%, editable. The plan uses the benefit
multiplied by (1 − the rate).

Help text: "Up to 85% of benefits can be subject to federal income tax.
How much depends on your other income. 10% is about 85% of benefits at a
12% tax rate. Most states do not tax benefits."

The app does not tax withdrawals from savings. Thus, this rate is the only
tax in the plan. The help text does not say more than that.

### 6. Benefits after the trust fund runs out

Social Security pays benefits mostly from the payroll taxes of people who
work now. It also has a reserve fund. The trustees of Social Security
project that the reserve fund runs out in about 2034. If Congress does not
change the law before then, payroll taxes pay about 80% of the scheduled
benefits. Congress fixed a similar problem in 1983, but no one knows what it
will do this time.

**Benefits paid from 2034: [100]%.** The default is 100%, which is the
amount that SSA shows. A cautious user can set 75–80% and keep Social
Security in the plan. The year (2034) is a constant in the code. Update it
when a trustees report changes it.

### 7. Medicare is an expense, not a deduction

Medicare Part B costs about $203 a month in 2026. SSA takes it from the
benefit, but people who do not claim yet pay it too. Thus, it is a cost
from age 65, not a smaller benefit. It is not a setting of the tab.

When the birth date is known, the Life Events tab offers a one-click event:
"Medicare at 65", on the date you turn 65, +$203 a month to expenses.
The help text says that early retirees must pay for health insurance
themselves until 65.

### 8. Double counting

If Social Security is on and an income row looks like Social Security (its
name includes "social security" or "SSA", and it does not end), the Income
tab shows a warning: "Social Security is calculated on its own tab. Remove
this row so it is not counted twice."

## Engine

New file `src/calculators/SocialSecurity.ts`, with ported code from
ssa.tools in `src/calculators/ssa/` (`constants.ts`, `pia.ts`,
`earning-record.ts`, `ssa-parse.ts`, `birthday.ts`, and the parts of
`benefit-calculator.ts` and `benefit-rounding.ts` that we use).

### Today's dollars

All amounts are in today's dollars, and the benefit is income that is
adjusted for inflation (benefits get a cost-of-living increase each year).

- Past earnings are indexed with the published wage index, as SSA does. If
  the indexing year (age 60) is after the latest published year, use the
  latest year (ssa.tools does the same).
- Future earnings in today's dollars count at full value, and the bend
  points stay at their latest values. This assumes that wages grow at the
  same rate as prices. Wages usually grow about 1% a year faster, so the
  benefit is a little low. That is acceptable and simple.
- Gross wages that are not adjusted for inflation are converted to today's
  dollars with the average inflation of the plan, not the inflation of each
  future. Thus, the benefit table is the same for all futures.

### The benefit table

The benefit depends on the retirement year, so the engine makes a table
before the simulation:

- `retired[k][t]`: the benefit (after tax and the 2034 percentage) in year t
  for a future that retired at the end of year k. Earnings stop after year
  k. The claim date comes from the claim rule.
- `working[t]`: the benefit in year t for a future that still works at the
  end of year t. It is not 0 only with "At age X" after full retirement age.
  It uses the earnings through year t − 1.

Each row is about 70 numbers, and there are about 70 rows. Make the table
once for each plan.

- **"On a date" and "Already retired":** only one row. Add it to
  `realOtherIncome` in the calendar. The simulation does not change.
- **"When ready":** `simulateFutures` adds `working[t]` while the future
  works. When the future retires at the end of year k (ready or forced), it
  adds `retired[k][t]` from then on. The rule only uses what the future
  knows at that time, the same as the ready line.

### The ready line

The fast backward pass assumes that income after retirement does not depend
on the retirement year. Social Security breaks this assumption, the same as
life events at retirement do. Plans with Social Security use the backward
pass for each retirement year (`backwardPass(s, k)` in `ReadyLine.tsx`),
with `retired[k]` as income. The cost is about 70 × 70 / 2 × 5,000 steps, or
some tens of milliseconds.

This is the same engine work as "income that starts at Retirement" in
`milestones.md`. Make it general, so that both features use it.

### Compare claiming ages

For each claim age X from 62 to 70 (the rule that the user selected, with X
changed): make the table, make the ready line, and replay the futures. Each
row of the comparison shows:

- the success rate,
- the median ready year ("when ready" plans),
- the median claim age,
- the median monthly benefit, and
- the median total benefits through the end year (today's dollars, after
  tax and the 2034 percentage, not discounted).

The plan's end year is the age to which the money must last. The comparison
does not discount the benefits, because the simulation invests the money
that the user takes from savings while they wait to claim. The best age is
the one with the highest success rate. The table marks it, and also marks
the ages within 1 point of it: the differences near the best age are often
smaller than the noise.

- All claim ages must use the same random sequences. Today,
  `requiredBalancesByYear` draws new returns at each call, which adds noise
  between the ages. Draw the backward-pass sequences once, keep them with
  the ready line data, and use them again.
- Cost: 9 replays. "On a date": milliseconds. "When ready": about 0.5–1
  second. Run it from a "Compare claiming ages" button, not at each run.
- Later, if it is useful: test each month near the best age.

## Results

- A line in the summary: "Social Security: $2,410/mo from 2061 (age 67),
  in today's dollars after tax". In "when ready" plans: the median, and the
  range of claim ages.
- If some futures get 0 because they have too few credits: "In 12% of
  futures, you retire before you earn 40 credits and get no benefit."
- Later: a marker on the graph for the claim date.

## Saved settings

```json
{
  "socialSecurity": {
    "enabled": true,
    "birthDate": "1994-05-12",
    "earnings": [{ "year": "2016", "earnings": "12000" }],
    "notYetRecorded": ["2025"],
    "overrides": [{ "year": "2025", "earnings": "95000" }],
    "claim": { "rule": "retirement", "years": "62", "months": "0" },
    "taxRate": "10",
    "percentFromShortfall": "100"
  },
  "jobs": [{ "...": "...", "grossWages": "120000" }]
}
```

- `claim.rule`: `"retirement"` (when I retire, but not before) or `"age"`.
- No `socialSecurity` means off. No `grossWages` means blank. Thus, old
  files give the same results, and the golden files do not change.
- The earnings record is saved in each scenario. Then each scenario is
  complete, and the fingerprint (#40) and the golden tests work. The cost:
  each copy of a scenario has its own copy of the record.
- `settingsDifferences.ts` shows "Earnings record differs", not a line for
  each year.
- This needs the settings version from `milestones.md` (version 2). If that
  work is merged first, this is version 3. If not, put both changes in
  version 2.

## Data that needs updates

Each October, SSA publishes new values. Update `ssa/constants.ts`:

- the taxable maximum (ssa.tools has it through 2027),
- the national average wage index (through 2025),
- the cost-of-living increase,
- the Medicare Part B premium (for the one-click life event).

Each update changes results. Thus, it increases `RESULTS_VERSION` (#40) and
updates the golden files (#35). The fork of ssa.tools gets the same updates,
so we can copy them from it.

## Testing

- Port the ssa.tools tests for the code that we port (`pia.test.ts`,
  `earning-record.test.ts`, the parse tests and their pastes).
- Compare a few benefits with the SSA calculator (ANYPIA) and with
  ssa.tools.
- Unit tests for the benefit table: it does not get smaller when k
  increases (more work years); it is 0 before 40 credits; the claim rules;
  the earnings-test approximation; the 2034 percentage.
- Unit tests for the estimated years and the overrides.
- Golden scenarios (#35): Social Security "On a date", "When ready" with
  "When I retire", "At age 70", too few credits, and 80% from 2034. The
  existing golden files must not change.
- Browser check of the paste flow and the tab at phone width.

## Pull requests

1. **Benefit library.** Port the ssa.tools code and its tests into
   `src/calculators/ssa/`, and add `SocialSecurity.ts` with the benefit
   table. No form, no change to results. This PR does not touch shared
   files, so it can start before #35, #40 and the milestones work merge.
2. **Tab and "On a date".** The tab, gross wages on income rows, the
   earnings table with estimates, the settings, and Social Security in "On
   a date" and "Already retired" plans. In "when ready" plans, the tab says
   "Coming soon" and the benefit is not used. Start after the milestones
   form work merges, because both change `MonteCarloForm.tsx` and the
   settings version.
3. **"When ready".** The benefit table in `simulateFutures`, the backward
   pass for each retirement year with the benefit, the "When I retire" rule,
   and the results line. Merge it soon after PR 2.
4. **Compare claiming ages.** The fixed random sequences, the comparison
   table, and the total benefits.
5. **Small items.** The Medicare life event, the double-counting warning,
   and a graph marker for the claim date.
6. **Couples.** Write it as an issue: a record and a birth date for each
   person, the spousal benefit (up to 50% of the other person's benefit at
   full retirement age), and survivor benefits (which need a model of
   death).

## Open questions

- Must the user be able to type a benefit (the PIA from their statement)
  instead of a record? ssa.tools allows it. It is easy, but then the
  benefit cannot change with the retirement year.
- Is the earnings-test approximation good enough, or must "At age X" before
  full retirement age only be allowed with "When I retire"?
- Must the 2034 percentage start in a year that the user can change?
