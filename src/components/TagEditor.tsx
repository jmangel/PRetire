import { KeyboardEvent, useId, useState } from 'react';
import { Badge, CloseButton, Form } from 'react-bootstrap';
import {
  ScenarioTags,
  TagSuggestion,
  TagVocabulary,
  addTag,
  parseTag,
  removeDimension,
  removeLabel,
  suggestTags,
} from '../scenarioTags';

/** A scenario's tags as chips: dimension tags in blue, labels in gray. */
export const TagChips = ({ tags, onRemove }: {
  tags?: ScenarioTags;
  onRemove?: (tag: { dimension: string } | { label: string }) => void;
}) => {
  const dimensions = Object.entries(tags?.dimensions ?? {});
  const labels = tags?.labels ?? [];
  if (dimensions.length === 0 && labels.length === 0) {
    return onRemove ? null : <span className="small text-muted">No tags</span>;
  }
  return (
    <>
      {dimensions.map(([dimension, value]) => (
        <Badge key={`d:${dimension}`} pill bg="primary-subtle" text="primary-emphasis" className="me-1 fw-normal d-inline-flex align-items-center">
          {dimension}:&nbsp;<b>{value}</b>
          {onRemove && (
            <CloseButton className="ms-1" style={{ fontSize: '0.5rem' }} aria-label={`Remove tag ${dimension}: ${value}`} onClick={() => onRemove({ dimension })} />
          )}
        </Badge>
      ))}
      {labels.map((label) => (
        <Badge key={`l:${label}`} pill bg="secondary-subtle" text="secondary-emphasis" className="me-1 fw-normal d-inline-flex align-items-center">
          {label}
          {onRemove && (
            <CloseButton className="ms-1" style={{ fontSize: '0.5rem' }} aria-label={`Remove tag ${label}`} onClick={() => onRemove({ label })} />
          )}
        </Badge>
      ))}
    </>
  );
};

/**
 * Edit a scenario's tags. Type "Dimension: value" for a dimension tag or a
 * word for a label, then press Enter or pick a suggestion. Dimensions and
 * values already in use are suggested as you type. Backspace in an empty
 * field removes the last tag.
 */
const TagEditor = ({ id, tags, onTagsChange, input, onInputChange, vocabulary }: {
  id: string;
  tags: ScenarioTags;
  onTagsChange: (tags: ScenarioTags) => void;
  /** What's typed but not added yet; the dialog adds it on Save too. */
  input: string;
  onInputChange: (input: string) => void;
  vocabulary: TagVocabulary;
}) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = open ? suggestTags(input, vocabulary, tags) : [];
  const activeIndex = Math.min(active, suggestions.length - 1);

  const pick = (suggestion: TagSuggestion) => {
    if (suggestion.completesDimension) {
      onInputChange(suggestion.text);
      setActive(0);
      return;
    }
    add(suggestion.text);
  };

  const add = (text: string) => {
    const tag = parseTag(text, vocabulary);
    if (!tag) return;
    onTagsChange(addTag(tags, tag));
    onInputChange('');
    setActive(0);
  };

  const removeLast = () => {
    if (tags.labels.length > 0) {
      onTagsChange(removeLabel(tags, tags.labels[tags.labels.length - 1]));
      return;
    }
    const dimensions = Object.keys(tags.dimensions);
    if (dimensions.length > 0) onTagsChange(removeDimension(tags, dimensions[dimensions.length - 1]));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault();
      setActive((activeIndex + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault();
      setActive((activeIndex - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      // Enter adds a tag here; it never saves the dialog or runs the simulation.
      event.preventDefault();
      event.stopPropagation();
      if (suggestions.length > 0 && activeIndex >= 0) pick(suggestions[activeIndex]);
      else add(input);
    } else if (event.key === 'Backspace' && input === '') {
      removeLast();
    }
  };

  return (
    <div>
      <div className="position-relative">
        <div className="form-control d-flex flex-wrap align-items-center gap-1" style={{ minHeight: '2.4rem' }}>
          <TagChips
            tags={tags}
            onRemove={(tag) =>
              onTagsChange('dimension' in tag ? removeDimension(tags, tag.dimension) : removeLabel(tags, tag.label))
            }
          />
          <input
            id={id}
            className="border-0 flex-grow-1"
            style={{ outline: 'none', minWidth: '10rem', background: 'transparent' }}
            placeholder={Object.keys(tags.dimensions).length + tags.labels.length === 0 ? 'e.g. Household: Married, or favorite' : ''}
            value={input}
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={suggestions.length > 0 ? `${listId}-${activeIndex}` : undefined}
            onChange={(event) => {
              onInputChange(event.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
          />
        </div>
        {suggestions.length > 0 && (
          <ul id={listId} role="listbox" className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 10, top: '100%' }}>
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.text + suggestion.isNew}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`list-group-item list-group-item-action py-1 d-flex justify-content-between ${index === activeIndex ? 'active' : ''}`}
                style={{ cursor: 'pointer' }}
                // mousedown, not click, so the input doesn't lose focus first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(suggestion);
                }}
              >
                <span>{suggestion.isNew ? `Add "${suggestion.label}"` : suggestion.label}</span>
                {suggestion.isNew && <small className={index === activeIndex ? '' : 'text-muted'}>new</small>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Form.Text className="text-muted">
        Type "Dimension: value" (like Household: Married) or a single word, then press Enter.
      </Form.Text>
    </div>
  );
};

export default TagEditor;
