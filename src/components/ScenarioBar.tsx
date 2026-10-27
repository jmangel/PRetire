import { KeyboardEvent, useEffect, useState } from 'react';
import { Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { ScenarioNotice } from './useSavedScenarios';

type NameMode = 'saveAs' | 'rename';

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
  onDelete,
  onExportAll,
}: {
  scenarios: Array<{ id: string; name: string }>;
  selectedId: string | null;
  lastBackupAt?: string;
  notice?: ScenarioNotice | null;
  onSelect: (id: string | null) => void;
  onSave: () => void;
  onSaveAs: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onExportAll: () => void;
}) => {
  const [nameMode, setNameMode] = useState<NameMode | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const selected = scenarios.find((scenario) => scenario.id === selectedId);

  // A name being typed belongs to the scenario that was picked when the field
  // opened, so close it when the pick changes.
  useEffect(() => {
    setNameMode(null);
  }, [selectedId]);

  const startNaming = (mode: NameMode) => {
    setNameMode(mode);
    setNameDraft(mode === 'rename' && selected ? selected.name : '');
  };

  const confirmName = () => {
    const name = nameDraft.trim();
    if (!name) return;
    if (nameMode === 'saveAs') onSaveAs(name);
    if (nameMode === 'rename') onRename(name);
    setNameMode(null);
  };

  // The name field sits inside the simulation form, where Enter would run
  // the simulation instead of confirming the name.
  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmName();
    } else if (event.key === 'Escape') {
      setNameMode(null);
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
      </Col>
      {nameMode ? (
        <Col xs={12} md={6}>
          <InputGroup>
            <Form.Control
              autoFocus
              aria-label={nameMode === 'saveAs' ? 'New scenario name' : 'Scenario name'}
              placeholder="Scenario name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={handleNameKeyDown}
            />
            <Button variant="primary" onClick={confirmName} disabled={!nameDraft.trim()}>
              {nameMode === 'saveAs' ? 'Save' : 'Rename'}
            </Button>
            <Button variant="outline-secondary" onClick={() => setNameMode(null)}>
              Cancel
            </Button>
          </InputGroup>
        </Col>
      ) : (
        <Col xs={12} md="auto" className="d-flex flex-wrap gap-2">
          <Button variant="outline-primary" onClick={onSave} disabled={!selected}>
            Save
          </Button>
          <Button variant="outline-primary" onClick={() => startNaming('saveAs')}>
            Save as new…
          </Button>
          <Button variant="outline-secondary" onClick={() => startNaming('rename')} disabled={!selected}>
            Rename
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
