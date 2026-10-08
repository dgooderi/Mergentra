import { state } from './state.js';
import { saveViewState } from './view-state.js';
import { setNote } from './notes-ui.js';
import { enhanceNoteField } from './note-field.js';
import { createSvgElement } from './graph-view.js';

export function createReferencePicker({ renderFilteredGraph }) {
  const ownerCache = new WeakMap();

  function ownersForGraph() {
    let owners = ownerCache.get(state.currentGraph);
    if (!owners) {
      const tips = new Set(state.currentGraph.references.map((reference) => reference.hash));
      const authorByTip = new Map();
      for (const commit of state.currentGraph.commits) {
        if (tips.has(commit.hash)) {
          authorByTip.set(commit.hash, commit.author || '');
        }
      }
      owners = new Map();
      for (const reference of state.currentGraph.references) {
        const author = (authorByTip.get(reference.hash) || '').replace(/\s*<[^>]*>$/, '').trim();
        // Branch owners match by name so different emails or capitalization still group together.
        owners.set(reference.name, author.replace(/\s+/g, ' ').toLowerCase());
      }
      ownerCache.set(state.currentGraph, owners);
    }
    return owners;
  }

  function referenceOwner(reference) {
    return ownersForGraph().get(reference.name) || '';
  }

  function renderOwnerFilter() {
    const select = document.getElementById('branch-owner-filter');
    const displayNames = new Map();
    for (const reference of state.currentGraph.references) {
      const owner = referenceOwner(reference);
      if (owner !== '' && !displayNames.has(owner)) {
        displayNames.set(
          owner,
          owner.replace(/(^|\s)\S/g, (match) => match.toUpperCase())
        );
      }
    }
    const owners = [...displayNames.keys()].sort((left, right) => left.localeCompare(right));
    select.replaceChildren(new Option('All owners', ''));
    for (const owner of owners) {
      select.append(new Option(displayNames.get(owner), owner));
    }
    if (!owners.includes(state.ownerFilter)) {
      state.ownerFilter = '';
    }
    select.value = state.ownerFilter;
  }

  function updateSummary() {
    const total = state.currentGraph
      ? state.availableReferenceNames
        ? state.availableReferenceNames.size
        : state.currentGraph.references.length
      : 0;
    const shown = state.availableReferenceNames
      ? [...state.visibleReferences].filter((name) => state.availableReferenceNames.has(name))
          .length
      : state.visibleReferences.size;
    document.getElementById('branch-picker-summary').textContent =
      `Branches: ${shown} of ${total} shown`;
  }

  function filter() {
    const query = document.getElementById('branch-picker-search').value.trim().toLowerCase();
    for (const lane of document.getElementById('reference-lanes').children) {
      lane.hidden =
        (query !== '' && !lane.dataset.refName.toLowerCase().includes(query)) ||
        (state.availableReferenceNames !== null &&
          !state.availableReferenceNames.has(lane.dataset.refName));
    }
  }

  function setVisibleBranches(predicate) {
    state.ownerFilter = '';
    state.visibleReferences = new Set(
      state.currentGraph.references.filter(predicate).map((reference) => reference.name)
    );
    saveViewState();
    renderReferenceLanes(state.currentGraph.references);
    renderFilteredGraph();
  }

  function renderReferenceLanes(references) {
    const laneList = document.getElementById('reference-lanes');
    laneList.replaceChildren();

    for (const reference of references) {
      const lane = document.createElement('li');
      const checkbox = document.createElement('input');
      const marker = createSvgElement('svg', {
        viewBox: '0 0 28 16',
        'aria-hidden': 'true'
      });
      const line = createSvgElement('line', {
        'data-testid': 'reference-lane-style',
        x1: 1,
        y1: 8,
        x2: 27,
        y2: 8,
        stroke: reference.color,
        'stroke-width': 3
      });
      const label = document.createElement('span');
      const labelGroup = document.createElement('div');

      lane.dataset.testid = 'reference-lane';
      lane.dataset.refName = reference.name;
      lane.dataset.remote = String(reference.remote);
      lane.dataset.checkedOut = String(reference.checkedOut);
      lane.dataset.color = reference.color;
      lane.dataset.laneIndex = String(reference.lane);
      lane.dataset.targetHash = reference.hash;
      checkbox.type = 'checkbox';
      checkbox.checked = state.visibleReferences.has(reference.name);
      checkbox.setAttribute('aria-label', reference.name);
      checkbox.dataset.testid = 'reference-filter';
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.visibleReferences.add(reference.name);
        } else {
          state.visibleReferences.delete(reference.name);
        }
        saveViewState();
        updateSummary();
        renderFilteredGraph();
      });
      marker.append(line);
      if (reference.remote) {
        line.setAttribute('stroke-dasharray', '6 4');
      }
      label.textContent = reference.name;
      labelGroup.className = 'reference-label';
      labelGroup.append(label);
      if (reference.checkedOut) {
        const checkedOutLabel = document.createElement('small');
        checkedOutLabel.className = 'checked-out-label';
        checkedOutLabel.dataset.testid = 'checked-out-label';
        checkedOutLabel.textContent = 'Checked out';
        labelGroup.append(checkedOutLabel);
      }
      if (reference.worktreePath) {
        const worktreeLocation = document.createElement('small');
        worktreeLocation.dataset.testid = 'reference-worktree';
        worktreeLocation.textContent = reference.worktreePath;
        labelGroup.append(worktreeLocation);
      }
      const noteToggle = document.createElement('button');
      const noteEditor = document.createElement('textarea');
      noteToggle.type = 'button';
      noteToggle.className = 'note-toggle secondary';
      noteToggle.dataset.testid = 'branch-note-toggle';
      noteToggle.setAttribute('aria-label', `Note for ${reference.name}`);
      noteToggle.textContent = Object.hasOwn(state.notes.branches, reference.name)
        ? 'Note ✎'
        : 'Note';
      noteEditor.rows = 2;

      noteEditor.className = 'note-editor';
      noteEditor.dataset.testid = 'branch-note-input';
      noteEditor.placeholder = 'Private note about this branch';
      noteEditor.setAttribute('aria-label', `Note text for ${reference.name}`);
      noteEditor.value = state.notes.branches[reference.name] || '';
      const noteField = enhanceNoteField(noteEditor, {
        label: `${reference.name} branch`,
        previewTestId: 'branch-note-preview'
      });
      noteField.element.hidden = true;
      noteToggle.addEventListener('click', () => {
        noteField.element.hidden = !noteField.element.hidden;
        if (!noteField.element.hidden) {
          noteField.showEditor();
          noteEditor.focus();
        }
      });
      noteEditor.addEventListener('input', () =>
        setNote('branches', reference.name, noteEditor.value)
      );
      lane.dataset.hasNote = String(Object.hasOwn(state.notes.branches, reference.name));
      lane.append(checkbox, marker, labelGroup, noteToggle, noteField.element);
      laneList.append(lane);
    }
    renderOwnerFilter();
    filter();
    updateSummary();
  }

  function init() {
    document.getElementById('branch-owner-filter').addEventListener('change', (event) => {
      const owner = event.target.value;
      setVisibleBranches((reference) => owner === '' || referenceOwner(reference) === owner);
      state.ownerFilter = owner;
      event.target.value = owner;
    });
    document.getElementById('branch-picker-search').addEventListener('input', filter);
    document
      .getElementById('branch-picker-all')
      .addEventListener('click', () => setVisibleBranches(() => true));
    document
      .getElementById('branch-picker-local')
      .addEventListener('click', () => setVisibleBranches((reference) => !reference.remote));
    document
      .getElementById('branch-picker-none')
      .addEventListener('click', () => setVisibleBranches(() => false));
  }

  return {
    init,
    render: renderReferenceLanes,
    refresh() {
      filter();
      updateSummary();
    }
  };
}
