import { KeyboardEvent, useEffect, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { ScenarioTags, TagVocabulary, addTag, emptyTags, parseTag } from '../scenarioTags';
import TagEditor from './TagEditor';

/** Another scenario with the same dimension tags, and how its settings differ. */
export type TagTwin = { name: string; differences: string[] };

export type ScenarioDialogMode =
  | { kind: 'saveAs'; tags: ScenarioTags; copiedFrom?: string }
  | { kind: 'editTags'; scenarioId: string; name: string; tags: ScenarioTags };

/**
 * Name and tag a new scenario, or change a saved scenario's tags. Tags start
 * as the picked scenario's, so "the same plan but married" is one change.
 * When the tags match another scenario's, a hint says so and lists how their
 * settings differ, since a tag for that difference is what tells them apart.
 */
const ScenarioTagsDialog = ({ mode, vocabulary, findTwin, onSaveAs, onSaveTags, onClose }: {
  mode: ScenarioDialogMode | null;
  vocabulary: TagVocabulary;
  findTwin: (tags: ScenarioTags, mode: ScenarioDialogMode) => TagTwin | null;
  onSaveAs: (name: string, tags: ScenarioTags) => void;
  onSaveTags: (scenarioId: string, tags: ScenarioTags) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState('');
  const [tags, setTags] = useState<ScenarioTags>(emptyTags());
  const [tagInput, setTagInput] = useState('');

  // Start from the dialog's tags each time it opens.
  useEffect(() => {
    if (!mode) return;
    setName('');
    setTags(mode.tags);
    setTagInput('');
  }, [mode]);

  if (!mode) return null;
  const isSaveAs = mode.kind === 'saveAs';

  // Text typed in the tag field but not added yet counts as a tag.
  const pending = parseTag(tagInput, vocabulary);
  const finalTags = pending ? addTag(tags, pending) : tags;
  const twin = findTwin(finalTags, mode);
  const canSave = !isSaveAs || name.trim() !== '';

  const save = () => {
    if (!canSave) return;
    if (mode.kind === 'saveAs') onSaveAs(name.trim(), finalTags);
    else onSaveTags(mode.scenarioId, finalTags);
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  };

  return (
    <Modal show onHide={onClose} aria-labelledby="scenario-dialog-title">
      <Modal.Header closeButton>
        <Modal.Title id="scenario-dialog-title" as="h5">
          {isSaveAs ? 'Save as new scenario' : `Edit tags for "${mode.name}"`}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="d-flex flex-column gap-3">
        {isSaveAs && (
          <Form.Group controlId="scenario_dialog_name">
            <Form.Label>Name</Form.Label>
            <Form.Control
              autoFocus
              value={name}
              placeholder="e.g. Austin, married"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleNameKeyDown}
            />
          </Form.Group>
        )}
        <Form.Group>
          <Form.Label htmlFor="scenario_dialog_tags">Tags</Form.Label>
          <TagEditor
            id="scenario_dialog_tags"
            tags={tags}
            onTagsChange={setTags}
            input={tagInput}
            onInputChange={setTagInput}
            vocabulary={vocabulary}
          />
          {mode.kind === 'saveAs' && mode.copiedFrom && (
            <Form.Text className="d-block text-muted">Tags copied from "{mode.copiedFrom}".</Form.Text>
          )}
        </Form.Group>
        {twin && (
          <Alert variant="warning" className="mb-0 small">
            <div><b>Same tags as "{twin.name}".</b> Add a tag to tell them apart? It's fine to keep them alike if they're variants of one plan.</div>
            {twin.differences.length > 0 ? (
              <>
                <div className="mt-1">Settings that differ:</div>
                <ul className="mb-0">
                  {twin.differences.map((difference) => <li key={difference}>{difference}</li>)}
                </ul>
              </>
            ) : (
              <div className="mt-1">Their settings are the same, too.</div>
            )}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={!canSave}>
          {isSaveAs ? 'Save scenario' : 'Save tags'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ScenarioTagsDialog;
