# Saved scenarios

Let people name and keep scenarios in their browser, tag them, and compare
them, without anything leaving their device. Clickable mockups of the full
design: https://claude.ai/artifact/FUPGuEStf6wcnZrfwiURNk (private to the
owner until shared).

## Decisions so far

- Scenarios live in `localStorage` only (`pretire.savedScenarios.v1`). JSON
  export/import stays as the backup and the way to move between browsers.
- Picking a scenario replaces the form and runs it, with no unsaved-changes
  warning.
- The page starts fresh each visit, with nothing picked, and nothing saves
  unless the user saves it.
- Restoring a backup matches scenarios by ID, keeps whichever copy was saved
  more recently, and adds " (restored)" to a name another scenario already
  has.
- Tags are free-form `Dimension: value` pairs (e.g. `Household: Married`)
  plus plain one-word tags. A dimension exists as soon as one scenario uses
  it.
- The compare grid shows success rate and median ready year.

## Phases

### A. Save, pick and back up scenarios (done, #31)

Scenario bar above the form: pick, Save, Save as new, Rename, Delete, Export
all scenarios. Import also restores a backup. The bar says where scenarios
live and when the last backup was made.

### B. Tags and the library (done)

As built: tags are stored with each scenario (optional, so older scenarios
load as untagged) and travel in backups. Save as new opens a dialog; Rename
stays inline. The library opens from a "Library" button in the scenario bar.
The saved-scenario code moved into a `useSavedScenarios` hook. Tags that
differ only in case are spelled one way: a restored "household: married"
joins the "Household: Married" already saved.

- A Save as dialog with a tag editor, pre-filled from the scenario you
  started from, that suggests existing dimensions and values as you type.
- Edit tags on a scenario that's already saved, from the scenario bar
  (next to Rename) and from each row in the library.
- A library view with a filter chip per dimension (values within one
  dimension match any; different dimensions must all match; checked labels
  match any too; "(none)" can't be typed as a value, since it means no
  value) and group by one or two dimensions in either order. No folders.
- When saving gives a scenario the same tags as another, show a hint: "This
  has the same tags as 'Austin, married'. Add a tag to tell them apart?",
  with the settings that differ between the two listed (e.g. "Differs in:
  life events, starting balance"). The code can say what differs but not
  what to call it, so the user picks the tag. It's a hint, not a rule: two
  scenarios may share a set of tags.

### C. Compare grid

Three PRs, each usable on its own:

- **C1. Result summaries.** Store a summary with each scenario, mark the ones
  that are out of date, and show it in the library rows.
- **C2. The grid.**
- **C3. Create from a neighbor**, then **Split by** (below).

#### C1. Result summaries (built)

As built: the code is in `src/resultSummary.ts`, and `RESULTS_VERSION` is in
`src/calculators/MonteCarlo.tsx`. Additions to what's below:

- A plan with no work income, or whose work has already ended, has no ready
  year to find. Its summary says `alreadyRetired: true`, shown as "already
  retired" rather than "never ready".
- A picked scenario can read back from the form a little differently from how
  it was saved, and still be the same plan: an older file, or no income rows
  where the form always shows a blank one. Picking runs it right away, so that
  first run records how it reads back, and later runs that match it count as
  runs of the saved scenario.
- Results also depend on the year they're run in, since the simulation starts
  next year. So the fingerprint includes the first simulated year, and every
  summary shows as out of date each January until its scenario runs again.

- **When one is stored.**
  - Saving stores a summary only if the results on the page came from
    exactly the settings being saved, meaning the same fingerprint. Otherwise
    (the form was edited after the last run, or never ran) the scenario is
    saved without a summary.
  - Running a picked scenario whose settings haven't been edited since it
    loaded also stores its summary: the Run button in the grid, and Run on
    the page. It changes only `summary`, not the settings, tags or
    `savedAt`, since it isn't an edit. If the settings were edited, nothing
    is stored until the user saves.
  - Editing tags keeps the summary that's there.
- **What it holds.** `summary?: { mode, successRate, medianReadyYear?,
  plannedRetirementYear?, confidence, fingerprint }`:
  - `mode` is the scenario's retirement mode, `'ready'` or `'date'`.
  - `successRate` (0 to 1) is the share of futures where the money lasts.
    In ready mode it's `summarizeReadyYears(...).successRate`, at the
    scenario's own saved desired success rate (`retirement.confidence`). In
    date mode it's the share of runs that never go below zero, as the
    results headline shows.
  - `medianReadyYear` (ready mode only) is `summarizeReadyYears(...).median`.
    Missing means the median future is never ready before the end year,
    unless `alreadyRetired`.
  - `plannedRetirementYear` (date mode only) is the year of
    `retirement.date`.
  - `confidence` is the desired success rate the summary used, so a grid can
    say when two cells used different ones.
  - `fingerprint` identifies the settings and calculation the run used
    (below).
- **Fingerprint.** `fingerprint = RESULTS_VERSION + ':' + first simulated
  year + ':' + hash(canonical settings)`.
  - The settings are first run through `migrateSettings`, so a file from
    before a format change and a new file with the same plan give the same
    fingerprint.
  - Canonical means JSON with object keys sorted at every level. Arrays (job
    rows, life events, asset classes) keep their order, since order shows on
    the page. Values are taken as stored, as strings, so "500000" and
    "500,000" differ.
  - The hash only has to tell settings apart, not be secure (e.g. 64-bit
    FNV-1a, in hex), and it must work without `async`.
  - `RESULTS_VERSION` is a number in the simulation code. Bump it whenever a
    change alters what a saved plan produces, so every older summary shows
    as out of date. The golden tests (#35) find those changes: a PR that
    updates `golden/expected/` bumps it in the same PR. A test can check
    that the version and the golden files change together, e.g. by keeping
    the version in the golden files too.
- **Out of date.** A summary is out of date when its `fingerprint` doesn't
  match the fingerprint of the scenario's current settings with the current
  `RESULTS_VERSION` and first simulated year. `savedAt` isn't used, because editing tags changes it. Out-of-date summaries still show,
  marked as such.
- **Library rows** show the summary: "89% · ready 2040", "89% · never ready",
  "89% · already retired" or "89% · retire 2045", with an "out of date" badge
  when it is. A scenario without one says "Not run".

#### C2. The grid

- Pick a dimension for rows and one for columns; pin the others with the
  filter chips.
- What a cell shows:
  - Ready mode: success rate and median ready year, e.g. "89% · 2040", or
    "89% · never" when `medianReadyYear` is missing.
  - Date mode: success rate and the planned year, e.g. "89% · retire 2045".
  - Shading follows the success rate.
- A cell with several scenarios shows the best, the count and the range.
- A scenario without a summary shows "Not run" with a Run button, which
  loads and runs it, then stores its summary (see C1). Out-of-date cells
  offer Run too. Nothing runs in the background.

#### C3. Create from a neighbor

An empty cell offers to create that combination from a neighbor: a filled
cell in the same row or column, which differs by one tag. With one neighbor,
it opens Save as from it with that tag changed. With several, it asks which to
start from and says which tag each would change. With none, it starts from the
current form. Only the tags change; the user still edits the settings to match
before saving.

#### Then: Split by

A grid shows two dimensions. For a third, either pin one value in the filter
bar, or use **Split by**: one small grid per value of the third dimension,
side by side, all with the same rows and columns so they compare at a glance.
Empty cells inside a split keep the split's tag when creating from a
neighbor. Past three dimensions, more grids stop being readable; the
library's filters handle that better. Mocked in the Compare grid view.

### D. Manage tags

Rename a dimension or value everywhere it's used (e.g. "SB" to "Santa
Barbara"), merge two values, and remove ones no scenario uses. Deferred until
there are enough tags for it to matter.

- Renaming or merging a tag counts as a tag edit on each scenario that has
  it, so it updates that scenario's tag save time (see the first follow-up
  below).
- Values that differ only in case are already one value: tags are spelled
  the way the first saved scenario spells them, when scenarios load and when
  a backup is restored. So merging is for values that are spelled
  differently ("SB" and "Santa Barbara"). The merged value keeps the
  spelling the user picks.

## Other follow-ups

- Keep separate save times for settings and tags (`tagsSavedAt`), and when
  restoring a backup, merge settings and tags separately, each keeping the
  newer copy. Today editing tags counts as a save of the whole scenario, so
  restoring a backup from a browser where only the tags were edited brings
  back that browser's older settings.
- Check the shape of each item in imported settings, so a hand-edited file
  can't crash the form (single-file import already had this weakness).

## Open questions

- Serve the app from its own domain? On `jmangel.github.io`, any of the
  owner's other GitHub Pages sites can read this site's `localStorage`.
