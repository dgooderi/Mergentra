import { describe, expect, it } from 'vitest';
import {
  classifyPatchLines,
  describeDiffError,
  summarizeChangedFiles
} from '../../src/renderer/diff-view.js';

describe('summarizeChangedFiles', () => {
  it('totals files and line counts and names binary files separately', () => {
    const files = [
      { path: 'a.js', additions: 3, deletions: 1, binary: false },
      { path: 'b.js', additions: 10, deletions: 0, binary: false },
      { path: 'logo.png', additions: 0, deletions: 0, binary: true }
    ];

    expect(summarizeChangedFiles(files)).toBe('3 files changed, +13 −1, 1 binary');
  });

  it('uses singular wording and reports an empty comparison', () => {
    expect(summarizeChangedFiles([{ path: 'a', additions: 1, deletions: 2, binary: false }])).toBe(
      '1 file changed, +1 −2'
    );
    expect(summarizeChangedFiles([])).toBe('No changes between these commits');
  });
});

describe('describeDiffError', () => {
  it('removes the Electron IPC wrapper so only the explanation remains', () => {
    const error = new Error(
      "Error invoking remote method 'diff:files': Error: That commit is not available in this repository."
    );

    expect(describeDiffError(error)).toBe('That commit is not available in this repository.');
  });

  it('falls back to a generic explanation for unexpected failures', () => {
    expect(describeDiffError(new Error('Command failed: git diff'))).toBe(
      'The changes could not be read from Git. Command failed: git diff'
    );
    expect(describeDiffError(undefined)).toBe('The changes could not be read from Git.');
  });
});

describe('classifyPatchLines', () => {
  it('labels each patch line so additions, removals, hunks and headers can be styled', () => {
    const patch = [
      'diff --git a/x b/x',
      'index 1..2 100644',
      '--- a/x',
      '+++ b/x',
      '@@ -1,2 +1,2 @@',
      ' keep',
      '-old',
      '+new',
      '\\ No newline at end of file'
    ].join('\n');

    expect(classifyPatchLines(patch)).toEqual([
      { kind: 'header', text: 'diff --git a/x b/x' },
      { kind: 'header', text: 'index 1..2 100644' },
      { kind: 'header', text: '--- a/x' },
      { kind: 'header', text: '+++ b/x' },
      { kind: 'hunk', text: '@@ -1,2 +1,2 @@' },
      { kind: 'context', text: ' keep' },
      { kind: 'removed', text: '-old' },
      { kind: 'added', text: '+new' },
      { kind: 'context', text: '\\ No newline at end of file' }
    ]);
  });

  it('treats a removed line that looks like a header as content once inside a hunk', () => {
    const lines = classifyPatchLines('@@ -1 +1 @@\n--- not a header\n+++ also content\n');

    expect(lines.map((line) => line.kind)).toEqual(['hunk', 'removed', 'added']);
  });
});
