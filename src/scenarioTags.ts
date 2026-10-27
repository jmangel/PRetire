// Tags on saved scenarios. A scenario can have one value per dimension
// ("Household: Married", "Location: Austin") and any number of plain labels
// ("favorite"). Dimensions are made up by the user: one exists as soon as a
// scenario uses it.

export type ScenarioTags = {
  /** One value per dimension, e.g. { Household: 'Married' }. */
  dimensions: Record<string, string>;
  /** Plain one-word-or-more tags, e.g. ['favorite']. */
  labels: string[];
};

/** Stands for "this scenario has no value for the dimension" in filters and groups. */
export const NO_VALUE = '(none)';

export const emptyTags = (): ScenarioTags => ({ dimensions: {}, labels: [] });

const sameText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Tags as stored, or undefined if `value` isn't a usable set of tags. */
export const cleanTags = (value: unknown): ScenarioTags | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const { dimensions, labels } = value as Partial<ScenarioTags>;
  const cleaned = emptyTags();
  if (dimensions && typeof dimensions === 'object') {
    Object.entries(dimensions).forEach(([dimension, tagValue]) => {
      if (typeof tagValue === 'string' && dimension.trim() && tagValue.trim()) {
        cleaned.dimensions[dimension.trim()] = tagValue.trim();
      }
    });
  }
  if (Array.isArray(labels)) {
    labels.forEach((label) => {
      if (typeof label === 'string' && label.trim() && !cleaned.labels.some((l) => sameText(l, label.trim()))) {
        cleaned.labels.push(label.trim());
      }
    });
  }
  return cleaned;
};

export const hasTags = (tags?: ScenarioTags) =>
  !!tags && (Object.keys(tags.dimensions).length > 0 || tags.labels.length > 0);

/** Every dimension and label in use, with each dimension's values, sorted by name. */
export type TagVocabulary = {
  dimensions: Array<{ name: string; values: string[] }>;
  labels: string[];
};

export const tagVocabulary = (scenarios: Array<{ tags?: ScenarioTags }>): TagVocabulary => {
  const dimensions: Array<{ name: string; values: string[] }> = [];
  const labels: string[] = [];
  scenarios.forEach(({ tags }) => {
    if (!tags) return;
    Object.entries(tags.dimensions).forEach(([name, value]) => {
      let dimension = dimensions.find((d) => sameText(d.name, name));
      if (!dimension) {
        dimension = { name, values: [] };
        dimensions.push(dimension);
      }
      if (!dimension.values.some((v) => sameText(v, value))) dimension.values.push(value);
    });
    tags.labels.forEach((label) => {
      if (!labels.some((l) => sameText(l, label))) labels.push(label);
    });
  });
  dimensions.sort((a, b) => byText(a.name, b.name));
  dimensions.forEach((d) => d.values.sort(byText));
  labels.sort(byText);
  return { dimensions, labels };
};

/** What the user typed, read as a tag. */
export type ParsedTag =
  | { kind: 'dimension'; dimension: string; value: string }
  | { kind: 'label'; label: string };

/**
 * Read "Dimension: value" as a dimension tag and anything without a colon as
 * a label. A dimension or value that's already in use is matched whatever its
 * case, and keeps the spelling it already has, so "household: married" joins
 * "Household: Married" rather than starting a new dimension.
 */
export const parseTag = (text: string, vocabulary: TagVocabulary): ParsedTag | null => {
  const colon = text.indexOf(':');
  if (colon === -1) {
    const label = text.trim();
    if (!label) return null;
    return { kind: 'label', label: vocabulary.labels.find((l) => sameText(l, label)) ?? label };
  }
  const dimensionText = text.slice(0, colon).trim();
  const valueText = text.slice(colon + 1).trim();
  if (!dimensionText || !valueText) return null;
  const known = vocabulary.dimensions.find((d) => sameText(d.name, dimensionText));
  return {
    kind: 'dimension',
    dimension: known?.name ?? dimensionText,
    value: known?.values.find((v) => sameText(v, valueText)) ?? valueText,
  };
};

/**
 * Add a tag. A dimension tag replaces that dimension's value in place, so its
 * chip doesn't move; a label already there isn't added twice.
 */
export const addTag = (tags: ScenarioTags, tag: ParsedTag): ScenarioTags => {
  if (tag.kind === 'dimension') {
    const entries = Object.entries(tags.dimensions);
    const at = entries.findIndex(([name]) => sameText(name, tag.dimension));
    if (at === -1) entries.push([tag.dimension, tag.value]);
    else entries[at] = [tag.dimension, tag.value];
    return { ...tags, dimensions: Object.fromEntries(entries) };
  }
  if (tags.labels.some((l) => sameText(l, tag.label))) return tags;
  return { ...tags, labels: [...tags.labels, tag.label] };
};

export const removeDimension = (tags: ScenarioTags, dimension: string): ScenarioTags => {
  const dimensions = { ...tags.dimensions };
  delete dimensions[dimension];
  return { ...tags, dimensions };
};

export const removeLabel = (tags: ScenarioTags, label: string): ScenarioTags => ({
  ...tags,
  labels: tags.labels.filter((l) => l !== label),
});

/** The value a scenario has for a dimension, or NO_VALUE. */
export const valueOf = (tags: ScenarioTags | undefined, dimension: string) =>
  tags?.dimensions[dimension] ?? NO_VALUE;

/** Whether two scenarios have the same dimension tags. Labels don't count. */
export const sameDimensionTags = (a: ScenarioTags | undefined, b: ScenarioTags | undefined) => {
  const aEntries = Object.entries(a?.dimensions ?? {});
  const bDimensions = b?.dimensions ?? {};
  return (
    aEntries.length === Object.keys(bDimensions).length &&
    aEntries.every(([name, value]) => bDimensions[name] !== undefined && sameText(bDimensions[name], value))
  );
};

/** A suggestion for the tag being typed. Picking it completes the text to `text`. */
export type TagSuggestion = {
  text: string;
  label: string;
  /** True when it would add a dimension, value or label that no scenario uses yet. */
  isNew: boolean;
  /** True when it only completes the dimension name, so the user still types a value. */
  completesDimension?: boolean;
};

/**
 * Suggestions for what's typed so far: existing dimensions to start with,
 * then existing values for the dimension before the colon, or existing
 * labels, with an entry to create a new one when nothing matches exactly.
 */
export const suggestTags = (
  input: string,
  vocabulary: TagVocabulary,
  tags: ScenarioTags
): TagSuggestion[] => {
  const startsWith = (text: string, prefix: string) =>
    text.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase());
  const used = (name: string) => Object.keys(tags.dimensions).some((d) => sameText(d, name));
  const colon = input.indexOf(':');

  if (colon !== -1) {
    const dimensionText = input.slice(0, colon).trim();
    const valueText = input.slice(colon + 1).trim();
    if (!dimensionText) return [];
    const known = vocabulary.dimensions.find((d) => sameText(d.name, dimensionText));
    const dimension = known?.name ?? dimensionText;
    const current = Object.entries(tags.dimensions).find(([name]) => sameText(name, dimension))?.[1];
    const suggestions: TagSuggestion[] = (known?.values ?? [])
      .filter((value) => startsWith(value, valueText) && !(current && sameText(current, value)))
      .map((value) => ({ text: `${dimension}: ${value}`, label: `${dimension}: ${value}`, isNew: false }));
    const alreadySet = current !== undefined && sameText(current, valueText);
    const offered = suggestions.some((s) => sameText(s.text, `${dimension}: ${valueText}`));
    if (valueText && !alreadySet && !offered) {
      suggestions.push({ text: `${dimension}: ${valueText}`, label: `${dimension}: ${valueText}`, isNew: true });
    }
    return suggestions;
  }

  const typed = input.trim();
  const dimensionSuggestions: TagSuggestion[] = vocabulary.dimensions
    .filter((d) => !used(d.name) && startsWith(d.name, typed))
    .map((d) => ({ text: `${d.name}: `, label: `${d.name}: …`, isNew: false, completesDimension: true }));
  if (!typed) return dimensionSuggestions;
  const labelSuggestions: TagSuggestion[] = vocabulary.labels
    .filter((label) => startsWith(label, typed) && !tags.labels.some((l) => sameText(l, label)))
    .map((label) => ({ text: label, label, isNew: false }));
  const exact = vocabulary.labels.some((l) => sameText(l, typed));
  return [
    ...dimensionSuggestions,
    ...labelSuggestions,
    ...(exact ? [] : [{ text: typed, label: typed, isNew: true }]),
  ];
};

/** Which scenarios to show: for each dimension, any of its picked values; and every picked label. */
export type TagFilters = {
  dimensions: Record<string, string[]>;
  labels: string[];
};

export const emptyFilters = (): TagFilters => ({ dimensions: {}, labels: [] });

export const filtersInUse = (filters: TagFilters) =>
  filters.labels.length > 0 || Object.values(filters.dimensions).some((values) => values.length > 0);

/**
 * Values picked within one dimension match any (OR); different dimensions
 * must all match (AND). NO_VALUE matches scenarios without that dimension.
 * Picked labels must all be on the scenario.
 */
export const matchesFilters = (tags: ScenarioTags | undefined, filters: TagFilters) =>
  Object.entries(filters.dimensions).every(
    ([dimension, values]) => values.length === 0 || values.includes(valueOf(tags, dimension))
  ) && filters.labels.every((label) => (tags?.labels ?? []).includes(label));

/** Scenarios grouped by one dimension's values, then optionally by a second's within each group. */
export type ScenarioGroup<T> = { value: string; items: T[]; subgroups?: Array<ScenarioGroup<T>> };

export const groupByDimensions = <T extends { tags?: ScenarioTags }>(
  items: T[],
  dimensions: string[]
): Array<ScenarioGroup<T>> => {
  const [dimension, ...rest] = dimensions;
  if (!dimension) return [];
  const values = Array.from(new Set(items.map((item) => valueOf(item.tags, dimension))))
    // Scenarios without the dimension come last.
    .sort((a, b) => (a === NO_VALUE ? 1 : b === NO_VALUE ? -1 : byText(a, b)));
  return values.map((value) => {
    const groupItems = items.filter((item) => valueOf(item.tags, dimension) === value);
    return rest.length > 0
      ? { value, items: groupItems, subgroups: groupByDimensions(groupItems, rest) }
      : { value, items: groupItems };
  });
};
