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
(calculated)" shows the amount and links to the tab. In "when ready" plans,
it shows the median amount and "varies by retirement year".

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
> Benefits paid from 2033: [100]% of the scheduled amount

- **Include Social Security** is off in new plans and in old files. With it
  off, the results do not change. Conservative users can keep it off.
- **Setup not complete.** If Include is on but the birth date or the
  earnings record (or a typed benefit) is missing, the tab shows a warning
  that names what is missing. The Income-tab row says "Needs birth date" or
  "Needs earnings record". The results do not change until both are there.
- **Birth date.** The app has no ages today. Social Security needs the birth
  date for age 62, full retirement age (67 for people born in 1960 or later),
  age 70, and the indexing year (the year you turn 60). Use the SSA rule
  that a person born on the 1st of a month is a month older
  (`birthday.ts` in ssa.tools).
- **The paste box** accepts the same formats as ssa.tools: the ssa.gov
  earnings page, two columns from a spreadsheet (year, earnings), and the
  table of this app. Port `ssa-parse.ts` and its test pastes.
  - Text that it cannot read: an error under the box, with the formats it
    accepts. The table does not change.
  - Some lines that it cannot read: "Read 38 years, skipped 2 lines."
  - Before a paste, the table shows "Paste your record above" and the
    estimated years only.
  - A paste that would replace years that the user entered asks first.
- **Privacy.** The text under the paste box says: "Your earnings record and
  birth date stay on this device. They are saved with this scenario and are
  in the settings files and backups that you export."
- **Remove earnings record** clears the record, the edits and the birth date
  from this scenario. Its help text says that other saved scenarios and
  exported files keep their own copies.

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
- Each year is capped at the SSA taxable maximum for that year. After the
  latest published year, use the latest published maximum (in today's
  dollars, see "Today's dollars").
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

- The earnings of "Estimated" and "Entered" years are number fields in the
  table. "Reset to estimate" is a link on "Entered" rows only.
- An edited value stays when the income rows change.
- A new paste replaces estimates and edits for the years that it includes.
- Years after this year are not in the table. The engine calculates them
  from the income rows for each retirement year (see "Engine").

### 4. When you claim

Two rules:

- **When I retire, but not before age X** (default X = 62). The claim date is
  the later of the retirement date and age X. It is never later than age 70,
  because the benefit does not grow after 70: a future that still works at
  70 claims at 70 while it works. In "when ready" plans, each future claims
  at a different age.
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
project that the reserve fund for retirement benefits (the OASI fund) runs
out in about 2033. If Congress does not change the law before then, payroll
taxes pay about 77% of the scheduled benefits. (The often-quoted 2034 and
80% are for the retirement and disability funds together, which the law
does not combine.) Congress fixed a similar problem in 1983, but no one
knows what it will do this time.

**Benefits paid from 2033: [100]%.** The default is 100%, which is the
amount that SSA shows. A cautious user can set about 75% and keep Social
Security in the plan. The year (2033) is a constant in the code. Update it
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

If Social Security is on and an income row looks like Social Security (it
is other income, not work income; its name includes "social security" or
"SSA"; and it has no end date), the Income
tab shows a warning: "Social Security is calculated on its own tab. Remove
this row so it is not counted twice."

## Engine

New file `src/calculators/SocialSecurity.ts`, with ported code from
ssa.tools in `src/calculators/ssa/` (`constants.ts`, `pia.ts`,
`earning-record.ts`, `ssa-parse.ts`, `birthday.ts`, and the parts of
`benefit-calculator.ts` and `benefit-rounding.ts` that we use).

ssa.tools reads the current year when its `constants.ts` loads
(`CURRENT_YEAR`), and the PIA code applies cost-of-living increases through
that year. In the port, `SocialSecurity.ts` passes the year in (the plan's
first year − 1). Otherwise, the results change each January even in the
golden tests, which fix the date only after the code loads.

### Today's dollars

All amounts are in today's dollars, and the benefit is income that is
adjusted for inflation (benefits get a cost-of-living increase each year).

- Past earnings are indexed with the published wage index, as SSA does. If
  the indexing year (age 60) is after the latest published year, use the
  latest year (ssa.tools does the same).
- Future earnings in today's dollars count at full value, and the bend
  points stay at their latest values. This assumes that wages grow at the
  same rate as prices. The SSA statement and ssa.tools make the same
  assumption. The trustees expect wages to grow about 1.1% a year faster
  than prices, and SSA indexes earnings to wages at age 60. Thus, for a
  person who is about 30 now, the benefit is about 25% lower than the
  trustees' best estimate. The difference gets smaller as the person gets
  nearer to 60. This is conservative, and it is a decision (not a mistake):
  the numbers match ssa.gov.
- Gross wages that are not adjusted for inflation are converted to today's
  dollars with the average inflation of the plan, not the inflation of each
  future. Thus, the benefit table is the same for all futures.

### The benefit table

The benefit depends on the retirement year, so the engine makes a table
before the simulation:

- `retired[k][t]`: the benefit (after tax and the 2033 percentage) in year t
  for a future that retired at the end of year k. The gross wages of income
  that stops at retirement end after year k. Other rows keep their own
  dates, so part-time work after retirement still adds earnings and
  credits. The claim date comes from the claim rule.
- `forced[t]`: the same, for a future that is forced to retire on the date
  that work income runs out (`workEnd`). That date can be in the middle of a
  year, so make this row like the "On a date" row: wages end on `workEnd`,
  and the claim date comes from the claim rule with `workEnd` as the
  retirement date. All forced futures use the same date, so one row is
  enough.
- `working[t]`: the benefit in year t for a future that still works at the
  end of year t. It is not 0 with "At age X" after the later of age X and
  full retirement age, and with "When I retire" from age 70. It uses the
  earnings through year t − 1.

Each row is about 70 numbers, and there are about 70 rows. Make the table
once for each plan.

- **"On a date" and "Already retired":** only one row. Add it to
  `realOtherIncome` in the calendar. The simulation does not change. But
  "On a date" plans also show a ready line and a "when ready" summary
  (`computeReadyLine` always runs, and `main` shows both), so these plans
  need the full table too (see "The ready line"). Do not put the one row
  in the ready line's calendar: then every retirement year would get the
  benefit for the planned date. The engine PR (PR 2) builds all of this
  before the form can turn Social Security on, so the results never
  disagree.
- **"When ready":** `simulateFutures` adds `working[t]` while the future
  works. When the future is ready at the end of year k, it adds
  `retired[k][t]` from then on. When it is forced to retire, it adds
  `forced[t]` from the year that contains `workEnd`. The rule only uses what
  the future knows at that time, the same as the ready line.

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
  tax and the 2033 percentage, not discounted).

The plan's end year is the age to which the money must last. The comparison
does not discount the benefits, because the simulation invests the money
that the user takes from savings while they wait to claim.

The best age:

- **"On a date" plans:** the highest success rate. The table also marks the
  ages within 1 point of it: the differences near the best age are often
  smaller than the noise.
- **"When ready" plans:** the earliest median ready year. In these plans,
  each future retires when it is safe at the plan's confidence, so the
  success rate is about the same at each claim age. What the claim age
  changes is how soon you are ready. The success rate stays as a column.

The table marks these rows with text ("Best", "Within 1 point"), not only
with color.

- **Where:** the button and the table are at the bottom of the Social
  Security tab. While it runs, the button is off and shows "Comparing…".
  When a setting changes after a comparison, the table is dimmed and says
  "Out of date. Compare again." At phone width, the table scrolls sideways.

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
- Unit tests for the benefit table: with the claim age fixed, the monthly
  benefit does not get smaller when k increases (more work years); it is 0
  before 40 credits; the claim rules; the claim at 70 while still working;
  the forced row; part-time wages after retirement; the earnings-test
  approximation; the 2033 percentage.
- Unit tests for the estimated years and the overrides.
- Golden scenarios (#35): Social Security "On a date", "When ready" with
  "When I retire", "At age 70", too few credits, and 77% from 2033. The
  existing golden files must not change.
- Browser check of the paste flow and the tab at phone width.

## Pull requests

1. **Benefit library.** Port the ssa.tools code and its tests into
   `src/calculators/ssa/`, and add `SocialSecurity.ts` with the benefit
   table. No form, no change to results. This PR only adds new files, so
   it can start before #35, #40 and the milestones work merge.
2. **Engine, all plan types.** The benefit table in `simulateFutures`
   (with the forced row and the claim at 70 while still working), the
   backward pass for each retirement year with the benefit, and both claim
   rules, in "On a date", "Already retired" and "when ready" plans. No
   form: Social Security cannot be turned on yet, so results do not
   change, and the golden files (#35) show it. Start after #35 merges,
   because #35 splits `run()` in `MonteCarlo.tsx`.
3. **Tab and form.** The tab, gross wages on income rows, the earnings
   table with estimates, the settings, the double-counting warning, and
   the results line. Social Security works in all plan types from the
   first release. Start after the first milestones PR merges, because both
   change `MonteCarloForm.tsx` and the settings version.
4. **Compare claiming ages.** The fixed random sequences, the comparison
   table, and the total benefits.
5. **Small items.** The typed benefit, the Medicare life event, and a graph
   marker for the claim date.
6. **Couples.** Write it as an issue: a record and a birth date for each
   person, the spousal benefit (up to 50% of the other person's benefit at
   full retirement age), and survivor benefits (which need a model of
   death).

## Settled after review

- **Typed benefit.** The user can type the benefit at full retirement age
  (the PIA from their SSA statement) instead of pasting a record. The field
  says: "This amount assumes that you work until full retirement age at
  your current pay. If you retire early, it is too high. For a more
  accurate amount, paste your earnings record." A typed benefit does not
  change with the retirement year. Built in PR 5.
- **Earnings test.** The approximation in decision 4 is good enough.
- **The shortfall year** (2033, the OASI fund) stays a constant in the
  code, not a setting. Nearly all users claim after it, so for them it is
  the same as one percentage on all benefits.
- **Wage growth** stays at the rate of prices (see "Today's dollars").
- **Best claiming age** in "when ready" plans is the earliest median ready
  year (see "Compare claiming ages").

## Risk for the milestones work

`milestones.md` adds "No later than", which makes the forced date earlier
than the end dates of the jobs. Today, `simulateFutures` does not stop work
income at a forced retirement (it only sets the retirement year), because
the forced date is the date that the work income runs out. With "No later
than", a forced future would get wages and the `forced` benefit row at the
same time. The milestones PR must stop work income at the forced date.
This is a bug in the milestones work even without Social Security: a
forced future would keep its salary after it retires.

**To do:** post this as a comment on #35, where `milestones.md` is
(not posted yet). Draft:

> `milestones.md` adds "No later than", which can force a retirement while
> a job with no end date still pays. Today `simulateFutures` doesn't stop
> work income at a forced retirement: it sets `retirementIndex` but not
> `stillWorking = false`, because today a forced retirement only happens
> once work income has already run out. With "No later than", a forced
> future would keep its salary after retiring. The milestones PR needs to
> stop work income on the forced date (prorated for that year, like
> `endingBy`) and add a golden scenario for it. The Social Security plan
> (`docs/plans/social-security.md`) depends on this too.
