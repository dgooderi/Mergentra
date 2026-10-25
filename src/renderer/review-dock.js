import { state } from './state.js';
import { renderSelectedBranchNotes, setNote } from './notes-ui.js';
import { inferBranchContext } from './branch-context.js';
import { enhanceNoteField } from './note-field.js';
import { explainHistoryBoundary } from './history-boundary-explanation.js';
import { createDiffViewer } from './diff-viewer.js';
import { createBlamePanel } from './blame-panel.js';

export function createReviewDock({ updateTimeNavigation }) {
  const dock = document.getElementById('review-dock');
  const boundaryPanel = document.getElementById('boundary-explanation-panel');
  const diffViewer = createDiffViewer();

  function showBoundaryExplanation(commit, requestedType) {
    const graph = state.currentGraph;
    const type =
      requestedType ||
      (graph?.shallowBoundaries.includes(commit.hash)
        ? 'shallow'
        : graph?.missingObjectBoundaries.includes(commit.hash)
          ? 'missing-object'
          : null);
    const explanation = type
      ? explainHistoryBoundary(type, graph?.historyBoundaryFacts || {})
      : null;
    boundaryPanel.hidden = !explanation;
    if (explanation) {
      document.getElementById('boundary-explanation-title').textContent = explanation.title;
      document.getElementById('boundary-explanation').textContent = explanation.explanation;
      document.getElementById('boundary-next-steps').textContent = explanation.nextSteps;
    }
  }

  const commitNoteField = enhanceNoteField(document.getElementById('selected-commit-note'), {
    label: 'commit',
    previewTestId: 'selected-commit-note-preview'
  });

  const blamePanel = createBlamePanel({
    getSelectedCommit: () => state.selectedCommit,
    findCommit: (hash) => state.currentGraph?.commits.find((commit) => commit.hash === hash),
    selectCommit: (commit) => selectCommit(commit)
  });

  function selectCommit(commit, { boundaryType } = {}) {
    if (diffViewer.consumeComparisonTarget(commit)) {
      return;
    }
    state.selectedCommit = commit;
    diffViewer.setSelectedCommit(commit);
    updateTimeNavigation();
    const hash = commit?.hash;
    const commitNodes = document.querySelectorAll('[data-testid="commit-node"]');
    for (const node of commitNodes) {
      node.setAttribute('aria-pressed', String(node.getAttribute('data-commit-hash') === hash));
    }
    const memberSummary = hash ? state.compactedMembership.get(hash) : null;
    for (const summaryNode of document.querySelectorAll('[data-testid="compacted-commit-count"]')) {
      summaryNode.setAttribute(
        'aria-pressed',
        String(Boolean(memberSummary) && summaryNode.dataset.summaryHash === memberSummary)
      );
    }
    for (const item of document.querySelectorAll('[data-testid="compacted-commit-item"]')) {
      item.setAttribute('aria-pressed', String(item.dataset.commitHash === hash));
    }
    if (!state.selectedCommit) {
      boundaryPanel.hidden = true;
      dock.hidden = true;
      blamePanel.clear();
      renderSelectedBranchNotes();
      return;
    }

    showBoundaryExplanation(state.selectedCommit, boundaryType);
    const noteInput = document.getElementById('selected-commit-note');
    noteInput.value = state.notes.commits[state.selectedCommit.hash] || '';
    commitNoteField.showEditor();
    noteInput.oninput = () => setNote('commits', state.selectedCommit.hash, noteInput.value);
    renderSelectedBranchNotes();

    document.getElementById('selected-commit-message').textContent = state.selectedCommit.subject;
    document.getElementById('selected-commit-author').textContent = state.selectedCommit.author;
    document.getElementById('selected-commit-author-date').textContent =
      state.selectedCommit.authorDate;
    document.getElementById('selected-commit-hash').textContent = state.selectedCommit.hash;
    const parents = state.selectedCommit.originalParents || state.selectedCommit.parents;
    document.getElementById('selected-commit-parents').textContent =
      parents.length > 0 ? parents.join(', ') : 'None (root commit)';

    const branchContext = state.currentGraph
      ? inferBranchContext(state.selectedCommit, state.currentGraph)
      : null;
    const contextElement = document.getElementById('selected-commit-branch-context');
    contextElement.hidden = !branchContext;
    if (branchContext) {
      const unknown = 'Could not be inferred';
      document.getElementById('selected-commit-source-label').textContent =
        branchContext.kind === 'divergence'
          ? 'Diverging branch (inferred)'
          : 'Source branch (inferred)';
      document.getElementById('selected-commit-source').textContent =
        branchContext.source ?? unknown;
      document.getElementById('selected-commit-destination-label').textContent =
        branchContext.kind === 'divergence'
          ? 'Diverges from (inferred)'
          : 'Destination branch (inferred)';
      document.getElementById('selected-commit-destination').textContent =
        branchContext.destination ?? unknown;
    }

    const references = document.getElementById('selected-commit-references');
    references.replaceChildren();
    if (state.selectedCommit.references.length === 0) {
      references.textContent = 'None';
    } else {
      for (const referenceName of state.selectedCommit.references) {
        const item = document.createElement('li');
        item.textContent = referenceName;
        references.append(item);
      }
    }
    dock.hidden = false;
  }

  return {
    hide() {
      boundaryPanel.hidden = true;
      dock.hidden = true;
      blamePanel.clear();
    },
    selectCommit,
    selectBoundary(type, hash) {
      const commit = state.currentGraph?.commits.find((candidate) => candidate.hash === hash);
      if (commit) {
        selectCommit(commit, { boundaryType: type });
      }
    }
  };
}
