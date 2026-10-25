import { classifyPatchLines, describeDiffError, summarizeChangedFiles } from './diff-view.js';

const STATUS_LABELS = {
  added: 'Added',
  deleted: 'Deleted',
  modified: 'Modified',
  typechange: 'Type changed'
};

function shortHash(hash) {
  return hash.slice(0, 7);
}

export function createDiffViewer() {
  const statusNode = document.getElementById('diff-status');
  const results = document.getElementById('diff-results');
  const summaryNode = document.getElementById('diff-summary');
  const filesNode = document.getElementById('diff-files');
  const fileNote = document.getElementById('diff-file-note');
  const patchNode = document.getElementById('diff-patch');
  const viewButton = document.getElementById('view-changes');
  const compareButton = document.getElementById('compare-commit');
  const closeButton = document.getElementById('close-diff');

  let baseCommit = null;
  let comparing = false;
  let request = null;
  let generation = 0;

  function clearResults() {
    generation += 1;
    request = null;
    results.hidden = true;
    closeButton.hidden = true;
    summaryNode.textContent = '';
    filesNode.replaceChildren();
    fileNote.textContent = '';
    patchNode.replaceChildren();
    statusNode.textContent = '';
  }

  function setComparing(value) {
    comparing = value;
    compareButton.setAttribute('aria-pressed', String(value));
    if (value) {
      statusNode.textContent = 'Select another commit in the graph to compare with.';
    }
  }

  async function showFile(file) {
    const current = generation;
    patchNode.replaceChildren();
    fileNote.textContent = '';
    if (file.binary) {
      fileNote.textContent = `${file.path} is a binary file, so no text diff is shown.`;
      return;
    }
    try {
      const result = await window.mergentra.loadFilePatch({ ...request, path: file.path });
      if (current !== generation) return;
      if (result.binary) {
        fileNote.textContent = `${file.path} is a binary file, so no text diff is shown.`;
        return;
      }
      if (file.submodule) {
        fileNote.textContent = `${file.path} is a submodule; only its recorded commit changed.`;
      } else if (result.patch === '') {
        fileNote.textContent = `No text changes to show for ${file.path}.`;
      }
      if (result.truncated) {
        fileNote.textContent = 'This diff is large, so only the start is shown.';
      }
      for (const line of classifyPatchLines(result.patch)) {
        const row = document.createElement('span');
        row.className = `diff-line diff-line-${line.kind}`;
        row.textContent = `${line.text}\n`;
        patchNode.append(row);
      }
    } catch (error) {
      if (current === generation) {
        fileNote.textContent = describeDiffError(error);
      }
    }
  }

  function renderFiles(diff) {
    filesNode.replaceChildren();
    summaryNode.textContent = summarizeChangedFiles(diff.files);
    for (const file of diff.files) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary diff-file';
      button.dataset.testid = 'diff-file';
      button.dataset.path = file.path;
      const label = file.binary
        ? 'Binary'
        : file.submodule
          ? 'Submodule'
          : `+${file.additions} −${file.deletions}`;
      button.textContent = `${STATUS_LABELS[file.status] || 'Changed'} · ${file.path} · ${label}`;
      button.addEventListener('click', () => {
        for (const other of filesNode.querySelectorAll('button')) {
          other.setAttribute('aria-pressed', String(other === button));
        }
        showFile(file);
      });
      item.append(button);
      filesNode.append(item);
    }
  }

  async function load(nextRequest) {
    clearResults();
    const current = generation;
    request = nextRequest;
    statusNode.textContent = 'Loading changes…';
    try {
      const diff = await window.mergentra.loadChangedFiles(nextRequest);
      if (current !== generation) return;
      statusNode.textContent = diff.from
        ? `Changes from ${shortHash(diff.from)} to ${shortHash(diff.to)}`
        : `Changes in root commit ${shortHash(diff.to)}`;
      renderFiles(diff);
      results.hidden = false;
      closeButton.hidden = false;
    } catch (error) {
      if (current === generation) {
        statusNode.textContent = describeDiffError(error);
        request = null;
      }
    }
  }

  viewButton.addEventListener('click', () => {
    setComparing(false);
    if (baseCommit) load({ commit: baseCommit.hash });
  });
  compareButton.addEventListener('click', () => {
    setComparing(!comparing);
    if (!comparing) statusNode.textContent = '';
  });
  closeButton.addEventListener('click', clearResults);

  return {
    // A new selected commit discards the previous diff and any pending comparison.
    setSelectedCommit(commit) {
      const changed = commit?.hash !== baseCommit?.hash;
      baseCommit = commit;
      if (changed) {
        setComparing(false);
        clearResults();
      }
    },
    // While comparing, the next commit picked in the graph is the comparison target.
    consumeComparisonTarget(commit) {
      if (!comparing || !commit || !baseCommit || commit.hash === baseCommit.hash) {
        return false;
      }
      setComparing(false);
      load({ commit: commit.hash, compareWith: baseCommit.hash });
      return true;
    }
  };
}
