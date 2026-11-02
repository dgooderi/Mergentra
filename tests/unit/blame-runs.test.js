import { describe, expect, it } from 'vitest';
import { annotateBlameRuns } from '../../src/renderer/blame-runs.js';

describe('blame run annotation', () => {
  it('marks only the first line of each consecutive run of the same commit', () => {
    const lines = [
      { line: 1, commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { line: 2, commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { line: 3, commit: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      { line: 4, commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
    ];

    expect(annotateBlameRuns(lines).map((row) => [row.line, row.startsRun, row.shortHash])).toEqual(
      [
        [1, true, 'aaaaaaa'],
        [2, false, 'aaaaaaa'],
        [3, true, 'bbbbbbb'],
        [4, true, 'aaaaaaa']
      ]
    );
  });
});
