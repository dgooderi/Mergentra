const EXPLAINED_ERRORS = new Set([
  'That commit is not available in this repository.',
  'The history before this commit is not available because this is a shallow clone.',
  'Choose a commit from the graph.',
  'Choose a changed file to view.',
  'Open a repository first.'
]);

export function describeDiffError(error) {
  const generic = 'The changes could not be read from Git.';
  const message = (error?.message ?? '')
    .replace(/^Error invoking remote method '[^']*': /, '')
    .replace(/^Error: /, '')
    .trim();
  if (EXPLAINED_ERRORS.has(message)) {
    return message;
  }
  return message === '' ? generic : `${generic} ${message}`;
}

export function classifyPatchLines(patch) {
  const lines = patch.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }
  let inHunk = false;
  return lines.map((text) => {
    if (text.startsWith('@@')) {
      inHunk = true;
      return { kind: 'hunk', text };
    }
    if (text.startsWith('diff --git')) {
      inHunk = false;
    }
    if (!inHunk) {
      return { kind: 'header', text };
    }
    if (text.startsWith('+')) return { kind: 'added', text };
    if (text.startsWith('-')) return { kind: 'removed', text };
    return { kind: 'context', text };
  });
}

export function summarizeChangedFiles(files) {
  if (files.length === 0) {
    return 'No changes between these commits';
  }
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);
  const binary = files.filter((file) => file.binary).length;
  const parts = [
    `${files.length} ${files.length === 1 ? 'file' : 'files'} changed`,
    `+${additions} −${deletions}`
  ];
  if (binary > 0) {
    parts.push(`${binary} binary`);
  }
  return parts.join(', ');
}
