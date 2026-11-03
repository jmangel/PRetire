# Plan: milestones, starting with Retirement

## Summary

Each date field in the plan can point to a **milestone** instead of a
specific date. The first milestone is **Retirement**. Each plan has exactly
one Retirement milestone, and you cannot delete it. It is the only milestone
that can have no fixed date: in "when ready" plans, each simulated future
retires in a different year.

Why: today, retirement is set by three different controls:

- the "When do you retire?" radio buttons,
- the income "Type of income" dropdown (work income stops at retirement),
- the life event "At retirement" switch.

The user must learn what each control does. With milestones, the user does
one thing in all date fields: select "Retirement", or select a date. Later,
named milestones (for example, "Alex retires" or "Kids start college") let
two rows share one date. When you change the milestone, all the rows that use
it change too.

This plan does not change the engine. The ready line, the per-future
retirement and the forced retirement stay as they are (see
`retire-when-ready.md`). This plan changes the form, the settings file and
the words on the screen. The golden tests (`src/calculators/Golden.test.ts`)
must show that the results of all saved plans do not change.

Phases are not part of this plan. We examined a model where each "phase" of
life holds a full copy of the settings. A floating retirement date changes
the order of the phases from one future to the next, so the values in a copy
can conflict. Rows with dates do not have this problem.

## Decisions

### 1. The Retirement milestone has three modes

On the Basics tab:

> **Retirement**
> ( ) When I'm ready, with a [90]% chance the money lasts *(default)*
> ( ) On a date: [____]
> ( ) Already retired
>
> [ ] No later than [____]

- **When I'm ready** and **On a date** work as they do today.
- **Already retired** replaces "set a date in the past". Income that ends at
  Retirement does not pay. Life events at Retirement do not occur (they
  occurred before the plan starts). There is no ready line. The results show
  the success rate, as in "On a date" mode.
- **No later than** is optional, and only for "When I'm ready". A future
  that is not ready by this date retires on this date. Use it for mandatory
  retirement, or for "we stop at 67 at the latest" for a couple.
- The **inferred forced date stays.** Today, a future also retires when all
  its work income has stopped on its own end dates. We keep this rule. If we
  remove it, a future can "keep working" with no work income, which has no
  meaning. The forced date is the earlier of "No later than" and the inferred
  date.
- "On a date" with a date before the plan starts gives the same result as
  "Already retired". The form shows a note that suggests "Already retired".

### 2. Income "Ends" replaces "Type of income"

Each income row has an **Ends** field. It replaces the "Type of income"
dropdown and the "End date" field.

> **Ends** [ Retirement ▾ ]  [ ] or on [____] if sooner
>
> Options: **Retirement** · **Pick a date…** · **Doesn't end**

| Ends | Meaning | Today |
|---|---|---|
| Retirement | Stops when you retire. | Work income, blank end date |
| Retirement, or on a date if sooner | Stops on the date, or when you retire if that occurs first (a job change). | Work income with an end date |
| A date | Stops on the date, also after you retire (part-time work, rent for some years). | Other income with an end date |
| Doesn't end | Pays until the end year (Social Security, a pension). | Other income, blank end date |

- New rows use **Retirement**. This is the same as today's default.
- The "or on a date if sooner" checkbox shows only with Retirement.
- The engine reads these values as today's two values (`stops` and
  `unaffected`) and an end date. Thus, the engine does not change.

### 3. Life event dates can be "Retirement"

The life event date field has the same picker, with two options:
**Retirement** · **Pick a date…**. "Retirement" replaces the "At retirement"
switch. The meaning does not change.

### 4. Words

- **"Pick a date…"** is the menu option for a specific date. When you select
  a date, the field shows the date, not the option name.
- **"Doesn't end"** is the option for income with no end.
- **"Retirement"** is the name of the milestone in all pickers.

## Scenarios

| Scenario | What you enter | What occurs |
|---|---|---|
| Single person | One income, Ends: Retirement. When ready. | As today. |
| Couple, retire together | Two incomes, Ends: Retirement. When ready. | Both stop in the same ready year, as today. |
| Couple, one stops earlier | A: Retirement, or on 2040-06-01 if sooner. B: Retirement. | As today's "couple, staggered". |
| Mandatory retirement at 67 | When ready, No later than 2045-03-01. | Not ready by then: forced to retire then. |
| Social Security | Starts 2052-03-01, Ends: Doesn't end. | As today's other income. |
| Already retired | Already retired. Social Security, Doesn't end. | Success rate only, no ready line. |
| Sell the house at retirement | Life event, date: Retirement. | As today's "At retirement" switch. |

## Saved settings

The settings file gets a version number, so migration, the
scenario differences check and the "settings changed" check of the
compare grid (see "Saved scenarios" below) can identify the format.

```json
{
  "version": 2,
  "retirement": { "mode": "ready", "confidence": "90", "date": "", "noLaterThan": "" },
  "jobs": [
    {
      "name": "Salary", "postTaxAnnualIncome": "110000", "adjustForInflation": true,
      "startDate": "",
      "end": { "kind": "retirement", "date": "" }
    }
  ],
  "life_events": [
    { "name": "Sell house", "balanceChange": "300000", "monthlyExpensesChange": "1500",
      "on": { "kind": "retirement" } }
  ]
}
```

- `retirement.mode`: `"ready"`, `"date"` or `"retired"`.
- `jobs[].end.kind`: `"retirement"` (with an optional `date` for "if
  sooner"), `"date"`, or `"never"`.
- `life_events[].on.kind`: `"retirement"` or `"date"` (with `date`).
- Later, named milestones add `{ "kind": "milestone", "id": "…" }` to the
  same fields. The format does not have to change again.

### Migration

`migrateSettings` first does the current steps (files from before income
types, and files from before the retirement setting). Then it converts
version 1 to version 2:

| Version 1 | Version 2 |
|---|---|
| no `version` | `version: 2` |
| `atRetirement: "stops"`, blank `endDate` | `end: { kind: "retirement", date: "" }` |
| `atRetirement: "stops"`, `endDate: D` | `end: { kind: "retirement", date: D }` |
| `atRetirement: "unaffected"`, blank `endDate` | `end: { kind: "never" }` |
| `atRetirement: "unaffected"`, `endDate: D` | `end: { kind: "date", date: D }` |
| life event `atRetirement: true` | `on: { kind: "retirement" }` |
| life event `atRetirement: false`, `date: D` | `on: { kind: "date", date: D }` |
| no `noLaterThan` | `noLaterThan: ""` |

Version 1 files do not have "Already retired". A version 1 file with "On a
date" before the plan starts stays "On a date". The results are the same.

## Engine

Files: `src/calculators/MonteCarlo.tsx` (`parsePlanInputs`),
`ReadyLine.tsx`.

- `parsePlanInputs` reads the new form fields and makes the same `Job` and
  `LifeEvent` objects as today. The simulation code does not change.
- **Already retired**: the parser gives `mode: 'date'` and a retirement date
  on the day before the plan starts. This is the same path as a retirement
  date in the past, which the golden scenario
  `retirement-date-before-simulation-start` covers. Do not use the first day
  of the plan: then life events at Retirement occur in the first year.
- **No later than**: `workEnd` becomes the earlier of `noLaterThan` and
  `workIncomeEndDate(jobs)`. This is the only change to the engine. With a
  blank `noLaterThan`, the results do not change.

## Form

File: `src/components/MonteCarloForm.tsx`.

- The Retirement fields (decision 1).
- One date picker component for income ends and life event dates
  (decisions 2 and 3). It submits two fields per row, for example
  `jobs[][endKind]` and `jobs[][endDate]`.
- Remove the "Type of income" dropdown and the "At retirement" switch.
- Export and import of version 2, with the migration above.

## Results

Files: `src/components/MonteCarloResultsCard.tsx`, `ReadyLineSummary.tsx`.

- "Already retired" shows the success rate, as "On a date" does. There is no
  ready line and no retirement marker on the graph.
- The summary of forced futures names the cause: "No later than" or "all
  work income ended".

## Saved scenarios (#34 and its plan)

- `src/settingsDifferences.ts` reads the settings format. Update it for
  version 2: the Retirement mode ("already retired"), "No later than", and
  the income ends. Compare the two scenarios after migration. If you do not,
  an old scenario and a new scenario show false differences.
- Phase C of `saved-scenarios.md` stores a result summary with each scenario
  and marks scenarios that changed since that run. Do that check on
  migrated settings, or migration marks all old scenarios as changed. The
  compare grid must also show a plan with "Already retired", which has no
  ready year.
- Merge #34 before this work starts. Both change `MonteCarloForm.tsx` a lot.

## Testing

- The golden tests must pass with no change to `golden/expected/`. Update
  the form data helper in `Golden.test.ts` to the new form fields. Keep the
  scenario files as they are (version 1): they also test the migration.
- Add golden scenarios in version 2 format: "Already retired", "No later
  than", and income with "A date" that pays after retirement.
- Unit tests for the migration table, the date picker and the Retirement
  fields, next to the code they test.
- Browser check of the new fields at phone width.

## Pull requests

1. **Retirement milestone.** Decisions 1 to 4, settings version 2, the
   migration, the `settingsDifferences.ts` update, and the tests above.
2. **Help for income.** Two add buttons, "Add job" (Ends: Retirement) and
   "Add other income (Social Security, pension, rent)" (Ends: Doesn't end).
   A warning when a row starts on a date and ends at Retirement: "This income
   ends when you retire. In futures that retire before 2052, it never pays.
   Did you mean 'Doesn't end'?"
3. **Named milestones.** A list of milestones on the Basics tab (a name and
   a date). They show in all pickers. Editing a milestone moves all the rows
   that use it.
4. **Graph markers.** Vertical lines for milestones, the median ready year
   and the range of ready years.

Later, and not in this plan: income that starts at Retirement (this needs
the per-retirement-year backward pass of the ready line), offsets such as
"2 years after Retirement", a timeline view by milestone, and an asset
allocation that changes at milestones. The asset allocation change draws
returns per asset class, which changes all golden results. Do it in a
separate PR and check it with statistics.

## Open questions

- Show the "or on a date if sooner" checkbox all the time, or only after the
  user clicks "Add an earlier end date"?
- Must "No later than" also apply to "On a date" mode, as a check that the
  date is not after it? (Proposal: no. In "On a date" mode, only the date is
  used.)
