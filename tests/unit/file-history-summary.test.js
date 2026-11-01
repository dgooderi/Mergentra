import { describe, expect, it } from 'vitest';
import { summarizeFileHistory } from '../../src/renderer/file-history.js';

const commit = (hash, committerTimestamp, subject = hash) => ({
  hash,
  committerTimestamp,
  subject
});

describe('file history summary', () => {
  const commits = [commit('a1', 100), commit('b2', 300), commit('c3', 200), commit('d4', 400)];

  it('lists the loaded commits that touched the path, newest first', () => {
    const summary = summarizeFileHistory(commits, {
      path: 'src/a.js',
      hashes: ['a1', 'b2', 'c3'],
      renames: [],
      shallow: false
    });

    expect(summary.matches.map((match) => match.hash)).toEqual(['b2', 'c3', 'a1']);
  });

  it('explains when no loaded commit changed the path', () => {
    const summary = summarizeFileHistory(commits, {
      path: 'src/gone.js',
      hashes: [],
      renames: [],
      shallow: false
    });

    expect(summary.notes).toEqual([
      'No commits in the loaded history changed "src/gone.js". Check the spelling of the path.'
    ]);
  });

  it('reports the renames that were followed and a shallow history', () => {
    const summary = summarizeFileHistory(commits, {
      path: 'new.js',
      hashes: ['b2', 'a1'],
      renames: [{ hash: 'b2', from: 'old.js', to: 'new.js' }],
      shallow: true
    });

    expect(summary.notes).toEqual([
      'Followed a rename: old.js → new.js.',
      'This is a shallow clone, so changes before its oldest commit are not shown.'
    ]);
  });

  it('counts touching commits that are not in the loaded graph', () => {
    const summary = summarizeFileHistory(commits, {
      path: 'a.js',
      hashes: ['b2', 'zz9'],
      renames: [],
      shallow: false
    });

    expect(summary.matches).toHaveLength(1);
    expect(summary.notes).toEqual(['1 matching commit is not in the loaded graph.']);
  });
});
