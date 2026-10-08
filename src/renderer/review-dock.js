import { state } from './state.js';
import { renderSelectedBranchNotes, setNote } from './notes-ui.js';
import { inferBranchContext } from './branch-context.js';

export function createReviewDock({ updateTimeNavigation }) {
  const dock = document.getElementById('review-dock');

  function selectCommit(commit) {
    state.selectedCommit = commit;
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
      dock.hidden = true;
      renderSelectedBranchNotes();
      return;
    }

    const noteInput = document.getElementById('selected-commit-note');
    noteInput.value = state.notes.commits[state.selectedCommit.hash] || '';
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
      dock.hidden = true;
    },
    selectCommit
  };
}
