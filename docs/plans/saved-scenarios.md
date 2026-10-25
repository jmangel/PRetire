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

### A. Save, pick and back up scenarios (#31)

Scenario bar above the form: pick, Save, Save as new, Rename, Delete, Export
all scenarios. Import also restores a backup. The bar says where scenarios
live and when the last backup was made.

### B. Tags and the library

- A Save as dialog with a tag editor, pre-filled from the scenario you
  started from, that suggests existing dimensions and values as you type.
- Edit tags on a scenario that's already saved, from the scenario bar
  (next to Rename) and from each row in the library.
- A library view with a filter chip per dimension (values within one
  dimension match any; different dimensions must all match) and group by
  one or two dimensions in either order. No folders.
- When saving gives a scenario the same tags as another, show a hint: "This
  has the same tags as 'Austin, married'. Add a tag to tell them apart?",
  with the settings that differ between the two listed (e.g. "Differs in:
  life events, starting balance"). The code can say what differs but not
  what to call it, so the user picks the tag. It's a hint, not a rule: two
  scenarios may share a set of tags.

### C. Compare grid

- Store a small result summary with each scenario when it's saved (success
  rate, median ready year), so the grid fills instantly. Mark scenarios whose
  settings changed since that run.
- Pick a dimension for rows and one for columns; pin the others with the
  filter chips. Each cell shows e.g. "89% · 2040", shaded by success rate.
  A cell with several scenarios shows the best, the count and the range.
- An empty cell offers to create that combination from a neighbor: a filled
  cell in the same row or column, which differs by one tag. With one
  neighbor, it opens Save as from it with that tag changed. With several, it
  asks which to start from and says which tag each would change. With none,
  it starts from the current form. Only the tags change; the user still edits
  the settings to match before saving.

### D. Manage tags

Rename a dimension or value everywhere it's used (e.g. "SB" to "Santa
Barbara"), merge two values, and remove ones no scenario uses. Deferred until
there are enough tags for it to matter.

## Open questions

- Serve the app from its own domain? On `jmangel.github.io`, any of the
  owner's other GitHub Pages sites can read this site's `localStorage`.
