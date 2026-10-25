import { describe, expect, it } from 'vitest';
import { describeReflogEntry } from '../../src/renderer/reflog-entry.js';

const hash = 'a'.repeat(40);

describe('describing a reflog entry', () => {
  it('says the commit can be shown in the graph when the graph contains it', () => {
    expect(describeReflogEntry({ hash, available: true }, new Set([hash]))).toEqual({
      state: 'in-graph',
      note: 'Select to show this commit in the graph.'
    });
  });

  it('explains that an available commit outside the graph is not reachable from a reference', () => {
    expect(describeReflogEntry({ hash, available: true }, new Set())).toEqual({
      state: 'unreachable',
      note: 'This commit is in the repository but is not reachable from any local branch or remote-tracking reference shown in the graph, so it can only be inspected here.'
    });
  });

  it('explains that a missing commit object was removed or never downloaded', () => {
    expect(describeReflogEntry({ hash, available: false }, new Set([hash]))).toEqual({
      state: 'unavailable',
      note: 'This commit object is no longer in the repository. Git removes unreferenced objects after their reflog entries expire, and a partial clone may never have downloaded it.'
    });
  });

  it('explains that an entry for a deleted reference has no commit', () => {
    expect(describeReflogEntry({ hash: null, available: false }, new Set())).toEqual({
      state: 'no-commit',
      note: 'This entry records the reference being deleted, so it has no commit.'
    });
  });
});
