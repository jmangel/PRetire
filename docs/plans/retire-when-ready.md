# Plan: retire when ready, by default

## Summary

New plans assume you retire **as soon as you're ready**: each simulated future
keeps working until its balance reaches the ready line at a confidence you
choose, then retires. Retiring on a fixed date stays available and behaves
exactly as the app does today.

Why: for most people the question is "when can I retire?", not "is this date
safe?". The ready line already answers the first question. Today, though, the
retirement date is worked out from income end dates, which makes the end date
mean two things. Couples have to keep two dates in sync, and a blank end date
gives a meaningless success rate near 100%.

## Decisions

### 1. Retirement is one setting for the whole plan

On the Basics tab:

> **When do you retire?**
> ( ) As soon as I'm ready, with a [90]% chance the money lasts *(default)*
> ( ) On a date: [____]

- The confidence moves from the results into the form and is saved with the
  plan's settings. The results keep a slider bound to the same value, so
  trying other confidence levels stays instant (see "Engine").
- The app stops working out retirement from income end dates
  (`plannedRetirementDate` is only used to open old saved files).

### 2. The income dropdown keeps its meaning, with new wording

| Today | New |
|---|---|
| At retirement, this income: **Stops** | **Work income** (stops when I retire) |
| At retirement, this income: **Keeps its own dates** | **Other income** (follows its own dates) |

Values in saved files (`stops` / `unaffected`) don't change.

### 3. End dates on work income mean "stops by this date at the latest"

- **Blank (default):** the income runs until you retire.
- **A date:** the income stops on that date, or at retirement if you retire
  first. Use it for a job change, mandatory retirement, or a spouse with their
  own planned stop date.

Help text: "Only if this income ends before you retire, like a job change."
Other income keeps today's meaning and help text.

### 4. Each future retires in its own ready year

In ready mode, every simulated future checks at the end of each year whether
its balance (today's dollars) has reached the ready line. The first year it
has, that future retires: from the next year on, work income stops and
spending comes out of savings.

The futures don't all retire in the median year. That would answer a
different question ("what if I commit to that year today?"), and the
fixed-date mode already answers it. The success rate in ready mode is at or
above the chosen confidence by design: futures with bad markets keep working
longer. That isn't a bias. Each year's ready line is the balance needed from
that point on, whatever came before.

A future whose work income all ends by its own end dates before it's ready
(mandatory retirement) retires on that date, ready or not.

### 5. Results

| | Ready mode (default) | Fixed-date mode |
|---|---|---|
| Header | "You'd typically be ready by the end of **2038**" with the existing range sentences ("Half are ready between…, 9 in 10 by…") | "Your simulation succeeded 87% of the time", as today |
| Below it | "If you re-check every year and retire once you reach the ready line, the money lasts in 93% of futures." | The "When you could retire" summary, as today |
| Chart | Futures that retire when ready; ready line up to a few years past the 90th percentile ready year | As today: futures retiring on the date; ready line up to that year |

- The **"keep working" toggle is removed.** In ready mode the futures already
  keep working until ready. In fixed-date mode the comparison it showed is
  ready mode, and the summary text already describes it.
- No special message for ready years near the end year, no "commit to this
  year" comparison, and no note about the optimism of keeping working in bad
  markets. All three were considered and dropped as unnecessary.

### 6. Life events can happen "at retirement"

A life event's date can be **At retirement** instead of a specific date (for
example, health insurance before Medicare or no more commuting). In ready mode
that's each future's own retirement year; in fixed-date mode, the plan's date.
Without this, ready mode can't model spending that changes at retirement, which
fixed dates can do today by matching dates.

## Scenarios

| Scenario | What you enter | What happens |
|---|---|---|
| Single person, retire when ready | One work income, no end date. Ready mode. | Retires in its own ready year; header shows the ready-year range. |
| Couple retiring together | Two work incomes, no end dates. Ready mode. | Both stop in the same ready year. |
| Couple, staggered | A's job ends 2040, B's has no end date. Ready mode. | Ready before 2040: both stop then. Otherwise A stops in 2040 and B works until ready. |
| Mandatory retirement | Job ends 2045. Ready mode. | Ready before 2045: retires then. Otherwise forced out in 2045; those futures lower the success rate and show as not ready by 2045. |
| "Can we stop in 2035?" | Fixed date 2035. | Today's behaviour. |

Not supported, on purpose: "A always stops N years before B" (a relative
stagger). Known limit, unchanged from today: Social Security doesn't depend on
when you stop working.

## Saved settings

New top-level section in the exported JSON:

```json
"retirement": { "mode": "ready", "confidence": "90", "date": "" }
```

Life events get `"atRetirement": true|false`.

Opening a file without `retirement`:

- If `plannedRetirementDate(jobs)` returns a date: **fixed-date mode** with
  that date. Its results don't change.
- Otherwise (some work income has a blank end date, or there's no work
  income): **ready mode**. For blank end dates this changes the result, but
  the old one assumed working until the end year, which is the meaningless
  near-100% case this plan fixes.

## Engine

Files: `src/calculators/MonteCarloSimulation.tsx`, `ReadyLine.tsx`,
`MonteCarlo.tsx`.

- **Work income end dates are caps.** Each future's work income stops at the
  earlier of its own end date and that future's retirement. Other income is
  unaffected. In fixed-date mode the retirement is the plan's date, which
  gives the same results as today for files opened from the old format.
- **Replayable futures.** Draw each future's yearly weighted return and
  inflation once (10,000 futures × years, about 12 MB as `Float64Array`s) and
  simulate from those draws instead of sampling inside `run()`. Simulating a
  future then takes no random draws, so:
  - ready mode can re-run every future when the confidence changes, in a few
    milliseconds, keeping the results slider live;
  - fixed-date and ready-mode results use the same markets, so the "When you
    could retire" summary in fixed-date mode compares like with like.
- **Ready-mode simulation.** Compute the ready line first
  (`requiredBalancesByYear` + `readyLineAt`), then replay each future: at the
  end of each year, if not yet retired and the inflation-adjusted balance is at
  or above that year's line, retire from the next year. Record each future's
  retirement year (ready, forced by end dates, or never).
- **Success rate** in ready mode is the plain count of replayed futures that
  never go below zero, so no separate lookup is needed.
- **Ready-year summary** comes from the recorded retirement years.
  `summarizeReadyYears` stays; it gains a count of futures forced out by end
  dates so the mandatory-retirement case can say so.
- **Remove** `keepWorkingJobs` and the separate 5,000 keep-working futures; the
  replayed ready-mode futures replace them.
- **At-retirement life events** depend on the retirement year, which breaks
  the "cash flows depend only on the calendar" property the one-pass backward
  calculation relies on. When the plan has at-retirement events, run the
  backward pass once per retirement year instead: O(years²) per sequence,
  about 14M steps for 75 years × 5,000 sequences, still well under a second.
  Plans without them keep the single pass.
- **No work income** (already retired): nothing to find. Both modes show the
  success rate, as today.

## Form

File: `src/components/MonteCarloForm.tsx`.

- "When do you retire?" radio, confidence input (50–99, matching the slider)
  and date input on the Basics tab. The date input is disabled in ready mode;
  the confidence input is disabled in fixed-date mode.
- Reword the income dropdown and the end-date help text (decisions 2 and 3).
- Life events: an "At retirement" switch beside the date that disables it.
- Export and import for the new fields, plus the migration above.

## Results

Files: `src/components/MonteCarloResultsCard.tsx`, `ReadyLineSummary.tsx`,
`MonteCarloGraph.tsx`.

- Header and summary per mode (decision 5). In ready mode the existing
  "If you re-check every year…" wording moves into the header area and the
  success rate follows it.
- The results slider updates the same confidence as the form. Moving it
  replays the futures; the chart redraw keeps today's settle delay when every
  future is drawn.
- Remove the "keep working" switch and `keepWorkingChartLastYear`'s planned
  year argument (ready mode uses the 90th percentile ready year only).

## Pull requests

1. **Engine.** Replayable futures, end dates as caps, ready-mode simulation,
   success rate and ready years from the replay, forced-out futures. The app
   keeps today's behaviour by running fixed-date mode with the inferred date
   (or no retirement when there isn't one).
2. **Form and settings.** "When do you retire?", confidence in the form,
   reworded income fields, settings export/import and migration. Ready mode
   becomes the default here.
3. **Results.** Mode-dependent header and chart, results slider bound to the
   form's confidence, keep-working switch removed.
4. **Life events at retirement.** Form switch, settings field, simulation, and
   the per-retirement-year backward pass.

Each PR adds tests next to the code it changes, following the existing
`*.test.tsx` files. `PlannedRetirement.test.tsx` shrinks to the migration
cases once retirement is no longer inferred.
