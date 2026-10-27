import { KeyboardEvent, useEffect, useState } from 'react';
import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { ScenarioNotice } from './useSavedScenarios';
import { ScenarioTags } from '../scenarioTags';
import { TagChips } from './TagEditor';


const formatBackupDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'never';

/** Pick, save, rename, delete and back up scenarios saved in this browser. */
const ScenarioBar = ({
  scenarios,
  selectedId,
  lastBackupAt,
  notice,
  onSelect,
  onSave,
  onSaveAs,
  onRename,
  onEditTags,
  onDelete,
  onExportAll,
}: {
  scenarios: Array<{ id: string; name: string; tags?: ScenarioTags }>;
  selectedId: string | null;
  lastBackupAt?: string;
  notice?: ScenarioNotice | null;
  onSelect: (id: string | null) => void;
  onSave: () => void;
  /** Opens the Save as dialog. */
  onSaveAs: () => void;
  onRename: (name: string) => void;
  onEditTags: (id: string) => void;
  onDelete: () => void;
  onExportAll: () => void;
}) => {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const selected = scenarios.find((scenario) => scenario.id === selectedId);

  // A name being typed belongs to the scenario that was picked when the field
  // opened, so close it when the pick changes.
  useEffect(() => {
    setRenaming(false);
  }, [selectedId]);

  const startRenaming = () => {
    setRenaming(true);
    setNameDraft(selected ? selected.name : '');
  };

  const confirmName = () => {
    const name = nameDraft.trim();
    if (!name) return;
    onRename(name);
    setRenaming(false);
  };

  // The name field sits inside the simulation form, where Enter would run
  // the simulation instead of confirming the name.
  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmName();
    } else if (event.key === 'Escape') {
      setRenaming(false);
    }
  };

  const handleDelete = () => {
    if (selected && window.confirm(`Delete "${selected.name}"? This can't be undone.`)) {
      onDelete();
    }
  };

  return (
    <Row className="m-2 gy-2 align-items-end">
      <Col xs={12} md={4}>
        <Form.Group controlId="saved_scenario">
          <Form.Label>Saved scenarios</Form.Label>
          <Form.Select
            value={selectedId ?? ''}
            onChange={(event) => onSelect(event.target.value || null)}
          >
            <option value="">
              {scenarios.length > 0 ? 'Pick a saved scenario…' : 'No saved scenarios yet'}
            </option>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        {selected && (
          <div className="mt-1" aria-label={`Tags of ${selected.name}`}>
            <TagChips tags={selected.tags} />
          </div>
        )}
      </Col>
      {renaming ? (
        <Col xs={12} md={6}>
          <InputGroup>
            <Form.Control
              autoFocus
              aria-label="Scenario name"
              placeholder="Scenario name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={handleNameKeyDown}
            />
            <Button variant="primary" onClick={confirmName} disabled={!nameDraft.trim()}>
              Rename
            </Button>
            <Button variant="outline-secondary" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </InputGroup>
        </Col>
      ) : (
        <Col xs={12} md="auto" className="d-flex flex-wrap gap-2">
          <Button variant="outline-primary" onClick={onSave} disabled={!selected}>
            Save
          </Button>
          <Button variant="outline-primary" onClick={onSaveAs}>
            Save as new…
          </Button>
          <Button variant="outline-secondary" onClick={startRenaming} disabled={!selected}>
            Rename
          </Button>
          <Button variant="outline-secondary" onClick={() => selected && onEditTags(selected.id)} disabled={!selected}>
            Edit tags
          </Button>
          <Button variant="outline-danger" onClick={handleDelete} disabled={!selected}>
            Delete
          </Button>
          <Button variant="outline-secondary" onClick={onExportAll} disabled={scenarios.length === 0}>
            Export all scenarios
          </Button>
        </Col>
      )}
      <Col xs={12}>
        <Form.Text className="text-muted">
          Saved scenarios stay in this browser on this device. Nothing is sent to a server.
          Browsers can clear saved data, so export a backup now and then.
          {scenarios.length > 0 && ` Last backed up: ${formatBackupDate(lastBackupAt)}.`}
        </Form.Text>
      </Col>
      {notice && (
        <Col xs={12}>
          <div className={notice.isError ? 'text-danger' : 'text-success'} role={notice.isError ? 'alert' : 'status'}>
            {notice.text}
          </div>
        </Col>
      )}
    </Row>
  );
};

export default ScenarioBar;
