import { Fragment, useState } from 'react';
import { Badge, Button, Card, Dropdown, Form } from 'react-bootstrap';
import {
  NO_VALUE,
  ScenarioGroup,
  ScenarioTags,
  TagFilters,
  TagVocabulary,
  emptyFilters,
  filtersInUse,
  groupByDimensions,
  matchesFilters,
} from '../scenarioTags';
import { TagChips } from './TagEditor';

type LibraryScenario = { id: string; name: string; tags?: ScenarioTags };

/** A filter chip: pick any number of values; none picked means any. */
const FilterChip = ({ label, values, picked, onChange }: {
  label: string;
  values: string[];
  picked: string[];
  onChange: (picked: string[]) => void;
}) => {
  const summary = picked.length === 0 ? 'Any' : picked.length === 1 ? picked[0] : `${picked.length} values`;
  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle
        size="sm"
        variant={picked.length > 0 ? 'primary' : 'outline-secondary'}
        className="rounded-pill"
        aria-label={`Filter by ${label}: ${summary}`}
      >
        {label}: {summary}
      </Dropdown.Toggle>
      <Dropdown.Menu className="px-3 py-2">
        {values.map((value) => (
          <Form.Check
            key={value}
            type="checkbox"
            id={`filter-${label}-${value}`}
            label={value}
            checked={picked.includes(value)}
            onChange={(event) =>
              onChange(event.target.checked ? [...picked, value] : picked.filter((v) => v !== value))
            }
          />
        ))}
        <div className="small text-muted border-top mt-1 pt-1">Checked values match any</div>
      </Dropdown.Menu>
    </Dropdown>
  );
};

/**
 * Every saved scenario, filtered by tags and grouped by one or two
 * dimensions. There are no folders: the grouping is picked per view and can
 * be flipped, so no dimension has to be the "top level".
 */
const ScenarioLibrary = ({ scenarios, vocabulary, selectedId, onLoad, onEditTags }: {
  scenarios: LibraryScenario[];
  vocabulary: TagVocabulary;
  selectedId: string | null;
  onLoad: (id: string) => void;
  onEditTags: (id: string) => void;
}) => {
  const [filters, setFilters] = useState<TagFilters>(emptyFilters());
  const [groupBy, setGroupBy] = useState<[string, string]>(['', '']);

  const dimensionNames = vocabulary.dimensions.map((d) => d.name);
  const hasNoValue = (dimension: string) => scenarios.some((s) => !s.tags?.dimensions[dimension]);
  const filterValues = (dimension: string) => [
    ...(vocabulary.dimensions.find((d) => d.name === dimension)?.values ?? []),
    ...(hasNoValue(dimension) ? [NO_VALUE] : []),
  ];

  // Filters and groupings for dimensions or values that no longer exist (a
  // tag was edited away, or another tab changed things) are ignored.
  const activeFilters: TagFilters = {
    dimensions: Object.fromEntries(
      Object.entries(filters.dimensions)
        .filter(([dimension]) => dimensionNames.includes(dimension))
        .map(([dimension, values]) => [dimension, values.filter((v) => filterValues(dimension).includes(v))])
    ),
    labels: filters.labels.filter((label) => vocabulary.labels.includes(label)),
  };
  const levels = groupBy.filter((d, i) => d && dimensionNames.includes(d) && groupBy.indexOf(d) === i);

  const shown = scenarios.filter((s) => matchesFilters(s.tags, activeFilters));

  const row = (scenario: LibraryScenario) => (
    <div
      key={scenario.id}
      className="d-flex flex-wrap align-items-center gap-2 border rounded bg-white px-2 py-2 mt-2"
      aria-label={`Scenario ${scenario.name}`}
    >
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="fw-medium">
          {scenario.name}
          {scenario.id === selectedId && <Badge bg="dark" className="ms-2 fw-normal">picked</Badge>}
        </div>
        <div className="mt-1"><TagChips tags={scenario.tags} /></div>
      </div>
      <Button size="sm" variant="outline-primary" onClick={() => onLoad(scenario.id)}>Load</Button>
      <Button size="sm" variant="link" onClick={() => onEditTags(scenario.id)}>Edit tags</Button>
    </div>
  );

  const renderGroups = (groups: Array<ScenarioGroup<LibraryScenario>>, depth: number) =>
    groups.map((group) => {
      const dimension = levels[depth];
      return (
        <section key={`${dimension}:${group.value}`} className={depth === 0 ? 'mt-3' : 'mt-2 ms-3'}>
          <div className={depth === 0 ? 'h6 border-bottom pb-1 mb-0' : 'small fw-semibold text-muted'}>
            {dimension}: {group.value} <span className="fw-normal text-muted small">{group.items.length}</span>
          </div>
          {group.subgroups ? renderGroups(group.subgroups, depth + 1) : group.items.map(row)}
        </section>
      );
    });

  return (
    <Card className="m-2" aria-label="Scenario library">
      <Card.Header className="d-flex flex-wrap align-items-center gap-2">
        <span className="small text-muted">Filter</span>
        {vocabulary.dimensions.map((dimension) => (
          <FilterChip
            key={dimension.name}
            label={dimension.name}
            values={filterValues(dimension.name)}
            picked={activeFilters.dimensions[dimension.name] ?? []}
            onChange={(picked) => setFilters({ ...filters, dimensions: { ...filters.dimensions, [dimension.name]: picked } })}
          />
        ))}
        {vocabulary.labels.length > 0 && (
          <FilterChip
            label="Tag"
            values={vocabulary.labels}
            picked={activeFilters.labels}
            onChange={(labels) => setFilters({ ...filters, labels })}
          />
        )}
        {vocabulary.dimensions.length === 0 && vocabulary.labels.length === 0 && (
          <span className="small text-muted">Tag scenarios to filter them.</span>
        )}
        {filtersInUse(activeFilters) && (
          <Button size="sm" variant="link" onClick={() => setFilters(emptyFilters())}>Clear filters</Button>
        )}
        <span className="ms-md-auto d-flex flex-wrap align-items-center gap-2">
          <Form.Label htmlFor="library_group_1" className="small text-muted mb-0">Group by</Form.Label>
          <Form.Select
            id="library_group_1"
            size="sm"
            style={{ width: 'auto' }}
            value={levels[0] ?? ''}
            onChange={(event) => setGroupBy([event.target.value, event.target.value ? groupBy[1] : ''])}
          >
            <option value="">Nothing</option>
            {dimensionNames.map((name) => <option key={name}>{name}</option>)}
          </Form.Select>
          <Form.Label htmlFor="library_group_2" className="small text-muted mb-0">then</Form.Label>
          <Form.Select
            id="library_group_2"
            size="sm"
            style={{ width: 'auto' }}
            value={levels[1] ?? ''}
            disabled={!levels[0]}
            onChange={(event) => setGroupBy([groupBy[0], event.target.value])}
          >
            <option value="">Nothing</option>
            {dimensionNames.filter((name) => name !== levels[0]).map((name) => <option key={name}>{name}</option>)}
          </Form.Select>
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={levels.length < 2}
            onClick={() => setGroupBy([levels[1], levels[0]])}
          >
            Flip order
          </Button>
        </span>
      </Card.Header>
      <Card.Body className="pt-2">
        {scenarios.length === 0 ? (
          <div className="text-muted">No saved scenarios yet. Use "Save as new…" to save one.</div>
        ) : shown.length === 0 ? (
          <div className="text-muted">
            No scenarios match these filters.{' '}
            <Button size="sm" variant="link" className="p-0 align-baseline" onClick={() => setFilters(emptyFilters())}>
              Clear filters
            </Button>
          </div>
        ) : (
          <>
            <div className="small text-muted">Showing {shown.length} of {scenarios.length} scenarios</div>
            {levels.length === 0
              ? shown.map(row)
              : <Fragment>{renderGroups(groupByDimensions(shown, levels), 0)}</Fragment>}
          </>
        )}
      </Card.Body>
    </Card>
  );
};

export default ScenarioLibrary;
