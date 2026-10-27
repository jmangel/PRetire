import {
  NO_VALUE,
  ScenarioTags,
  addTag,
  cleanTags,
  emptyFilters,
  emptyTags,
  filtersInUse,
  groupByDimensions,
  matchesFilters,
  withSharedSpelling,
  parseTag,
  removeDimension,
  removeLabel,
  sameDimensionTags,
  suggestTags,
  tagVocabulary,
} from './scenarioTags';

const tags = (dimensions: Record<string, string>, labels: string[] = []): ScenarioTags => ({ dimensions, labels });
const scenarios = [
  { name: 'SB single', tags: tags({ Household: 'Single', Location: 'Santa Barbara' }, ['favorite']) },
  { name: 'Austin married', tags: tags({ Household: 'Married', Location: 'Austin' }) },
  { name: 'Austin single', tags: tags({ Household: 'Single', Location: 'Austin' }, ['idea']) },
  { name: 'Untagged' },
  { name: 'Lisbon', tags: tags({ Location: 'Lisbon' }) },
];
const vocabulary = tagVocabulary(scenarios);

describe('cleanTags', () => {
  test('keeps usable tags, trimmed, without duplicate labels', () => {
    expect(cleanTags({ dimensions: { ' Household ': ' Married ' }, labels: ['fav', 'FAV', ' x '] }))
      .toEqual(tags({ Household: 'Married' }, ['fav', 'x']));
  });

  test('drops what it cannot use', () => {
    expect(cleanTags(null)).toBeUndefined();
    expect(cleanTags('Household: Married')).toBeUndefined();
    expect(cleanTags({ dimensions: { Household: 3, '': 'x', Location: '' }, labels: 'nope' })).toEqual(emptyTags());
  });
});

describe('tagVocabulary', () => {
  test('lists every dimension with its values, and every label, sorted', () => {
    expect(vocabulary).toEqual({
      dimensions: [
        { name: 'Household', values: ['Married', 'Single'] },
        { name: 'Location', values: ['Austin', 'Lisbon', 'Santa Barbara'] },
      ],
      labels: ['favorite', 'idea'],
    });
  });
});

describe('parseTag', () => {
  test('reads "Dimension: value" and plain labels', () => {
    expect(parseTag('Career: Go freelance', vocabulary)).toEqual({ kind: 'dimension', dimension: 'Career', value: 'Go freelance' });
    expect(parseTag('  draft ', vocabulary)).toEqual({ kind: 'label', label: 'draft' });
  });

  test('matches existing dimensions, values and labels whatever the case', () => {
    expect(parseTag('household:married', vocabulary)).toEqual({ kind: 'dimension', dimension: 'Household', value: 'Married' });
    expect(parseTag('FAVORITE', vocabulary)).toEqual({ kind: 'label', label: 'favorite' });
  });

  test('ignores a missing dimension or value', () => {
    expect(parseTag('Household:', vocabulary)).toBeNull();
    expect(parseTag(': Married', vocabulary)).toBeNull();
    expect(parseTag('   ', vocabulary)).toBeNull();
  });

  test('refuses "(none)" as a value, since filters use it for no value', () => {
    expect(parseTag('Household: (none)', vocabulary)).toBeNull();
    expect(parseTag('Household: (NONE) ', vocabulary)).toBeNull();
    expect(suggestTags('Household: (none)', vocabulary, emptyTags())).toEqual([]);
    expect(cleanTags({ dimensions: { Household: '(none)', Location: 'Austin' }, labels: [] }))
      .toEqual({ dimensions: { Location: 'Austin' }, labels: [] });
  });
});

describe('adding and removing tags', () => {
  test('a dimension tag replaces that dimension in place, whatever the case typed', () => {
    const start = tags({ Household: 'Single', Location: 'Austin' });
    const changed = addTag(start, { kind: 'dimension', dimension: 'household', value: 'Married' });
    expect(changed).toEqual(tags({ household: 'Married', Location: 'Austin' }));
    expect(Object.keys(changed.dimensions)).toEqual(['household', 'Location']);
    expect(Object.keys(addTag(start, { kind: 'dimension', dimension: 'Career', value: 'x' }).dimensions))
      .toEqual(['Household', 'Location', 'Career']);
  });

  test('a label already there is not added twice', () => {
    const start = tags({}, ['favorite']);
    expect(addTag(start, { kind: 'label', label: 'Favorite' })).toBe(start);
    expect(addTag(start, { kind: 'label', label: 'idea' })).toEqual(tags({}, ['favorite', 'idea']));
  });

  test('removes a dimension or a label', () => {
    const start = tags({ Household: 'Single', Location: 'Austin' }, ['a', 'b']);
    expect(removeDimension(start, 'Household')).toEqual(tags({ Location: 'Austin' }, ['a', 'b']));
    expect(removeLabel(start, 'a')).toEqual(tags({ Household: 'Single', Location: 'Austin' }, ['b']));
  });
});

describe('sameDimensionTags', () => {
  test('compares dimension tags only, ignoring labels and case', () => {
    expect(sameDimensionTags(tags({ Household: 'Married' }, ['x']), tags({ Household: 'married' }))).toBe(true);
    expect(sameDimensionTags(tags({ Household: 'Married' }), tags({ Household: 'Married', Location: 'Austin' }))).toBe(false);
    expect(sameDimensionTags(undefined, tags({}))).toBe(true);
  });
});

describe('suggestTags', () => {
  test('with nothing typed, suggests dimensions the scenario does not have yet', () => {
    expect(suggestTags('', vocabulary, tags({ Household: 'Single' })).map((s) => s.label)).toEqual(['Location: …']);
  });

  test('after a colon, suggests that dimension\'s values, then a new one', () => {
    expect(suggestTags('location: a', vocabulary, emptyTags()).map((s) => [s.text, s.isNew]))
      .toEqual([['Location: Austin', false], ['Location: a', true]]);
    expect(suggestTags('Location: Austin', vocabulary, emptyTags()).map((s) => s.text)).toEqual(['Location: Austin']);
    expect(suggestTags('Pets: Dog', vocabulary, emptyTags())).toEqual([
      { text: 'Pets: Dog', label: 'Pets: Dog', isNew: true },
    ]);
  });

  test("leaves out the value the scenario already has", () => {
    expect(suggestTags('Location: ', vocabulary, tags({ Location: 'Austin' })).map((s) => s.text))
      .toEqual(['Location: Lisbon', 'Location: Santa Barbara']);
    expect(suggestTags('location: austin', vocabulary, tags({ Location: 'Austin' }))).toEqual([]);
  });

  test('without a colon, suggests dimensions and labels that start with it, then a new label', () => {
    expect(suggestTags('i', vocabulary, emptyTags()).map((s) => [s.text, s.isNew])).toEqual([['idea', false], ['i', true]]);
    expect(suggestTags('ho', vocabulary, emptyTags())[0]).toMatchObject({ text: 'Household: ', completesDimension: true });
    expect(suggestTags('idea', vocabulary, emptyTags()).map((s) => s.text)).toEqual(['idea']);
  });
});

describe('matchesFilters', () => {
  test('any value within a dimension, every dimension, any label', () => {
    const austinOrLisbon = { dimensions: { Location: ['Austin', 'Lisbon'] }, labels: [] };
    expect(scenarios.filter((s) => matchesFilters(s.tags, austinOrLisbon)).map((s) => s.name))
      .toEqual(['Austin married', 'Austin single', 'Lisbon']);

    const singleInAustin = { dimensions: { Location: ['Austin'], Household: ['Single'] }, labels: [] };
    expect(scenarios.filter((s) => matchesFilters(s.tags, singleInAustin)).map((s) => s.name)).toEqual(['Austin single']);

    const ideas = { dimensions: {}, labels: ['idea'] };
    expect(scenarios.filter((s) => matchesFilters(s.tags, ideas)).map((s) => s.name)).toEqual(['Austin single']);

    const favoriteOrIdea = { dimensions: {}, labels: ['favorite', 'idea'] };
    expect(scenarios.filter((s) => matchesFilters(s.tags, favoriteOrIdea)).map((s) => s.name))
      .toEqual(['SB single', 'Austin single']);
  });

  test('"(none)" matches scenarios without the dimension', () => {
    const noHousehold = { dimensions: { Household: [NO_VALUE] }, labels: [] };
    expect(scenarios.filter((s) => matchesFilters(s.tags, noHousehold)).map((s) => s.name)).toEqual(['Untagged', 'Lisbon']);
  });

  test('no filters match everything', () => {
    expect(scenarios.every((s) => matchesFilters(s.tags, emptyFilters()))).toBe(true);
    expect(filtersInUse(emptyFilters())).toBe(false);
    expect(filtersInUse({ dimensions: { Location: [] }, labels: [] })).toBe(false);
    expect(filtersInUse({ dimensions: {}, labels: ['x'] })).toBe(true);
  });
});

describe('groupByDimensions', () => {
  test('groups by one dimension, with "(none)" last', () => {
    expect(groupByDimensions(scenarios, ['Household']).map((g) => [g.value, g.items.map((s) => s.name)])).toEqual([
      ['Married', ['Austin married']],
      ['Single', ['SB single', 'Austin single']],
      [NO_VALUE, ['Untagged', 'Lisbon']],
    ]);
  });

  test('groups by a second dimension within each group, in either order', () => {
    const byLocationThenHousehold = groupByDimensions(scenarios, ['Location', 'Household']);
    expect(byLocationThenHousehold[0]).toMatchObject({ value: 'Austin' });
    expect(byLocationThenHousehold[0].subgroups!.map((g) => [g.value, g.items.length])).toEqual([['Married', 1], ['Single', 1]]);

    const byHouseholdThenLocation = groupByDimensions(scenarios, ['Household', 'Location']);
    expect(byHouseholdThenLocation[1].subgroups!.map((g) => g.value)).toEqual(['Austin', 'Santa Barbara']);
  });

  test('nothing to group by gives no groups', () => {
    expect(groupByDimensions(scenarios, [])).toEqual([]);
  });
});

describe('withSharedSpelling', () => {
  test('spells each tag the way the first scenario using it does', () => {
    const scenarios = [
      { tags: tags({ Household: 'Married' }, ['favorite']) },
      {},
      { tags: tags({ household: 'married', Location: 'Austin' }, ['FAVORITE', 'idea']) },
      { tags: tags({ HOUSEHOLD: 'Single', location: 'austin' }) },
    ];
    expect(withSharedSpelling(scenarios)).toEqual([
      { tags: tags({ Household: 'Married' }, ['favorite']) },
      {},
      { tags: tags({ Household: 'Married', Location: 'Austin' }, ['favorite', 'idea']) },
      { tags: tags({ Household: 'Single', Location: 'Austin' }) },
    ]);
  });

  test('keeps one value when a scenario has the same dimension in two cases', () => {
    expect(withSharedSpelling([{ tags: tags({ Household: 'Married', household: 'Single' }) }]))
      .toEqual([{ tags: tags({ Household: 'Married' }) }]);
  });
});
