import { describe, expect, it } from 'vitest';
import { revealCommit, searchCommits } from '../../src/renderer/commit-search.js';

function commit(hash, subject, extra = {}) {
  return {
    hash,
    parents: [],
    subject,
    author: 'Ada Lovelace <ada@example.com>',
    authorDate: '2024-03-05T10:00:00+00:00',
    committerTimestamp: 1709632800,
    tags: [],
    references: [],
    ...extra
  };
}

describe('searchCommits', () => {
  it('finds commits whose message contains the query, ignoring case', () => {
    const commits = [commit('aaa111', 'Fix login Bug'), commit('bbb222', 'Add readme')];
    const outcome = searchCommits(commits, 'bug');
    expect(outcome.status).toBe('results');
    expect(outcome.results.map((result) => result.hash)).toEqual(['aaa111']);
  });

  it('finds commits by author name or email', () => {
    const commits = [
      commit('aaa111', 'One', { author: 'Grace Hopper <grace@navy.example>' }),
      commit('bbb222', 'Two')
    ];
    expect(searchCommits(commits, 'hopper').results.map((r) => r.hash)).toEqual(['aaa111']);
    expect(searchCommits(commits, 'ADA@example').results.map((r) => r.hash)).toEqual(['bbb222']);
  });

  it('finds commits by hash prefix but not by a hash fragment', () => {
    const commits = [commit('9f3c2a7d', 'One'), commit('1b9f3c00', 'Two')];
    expect(searchCommits(commits, '9F3C').results.map((r) => r.hash)).toEqual(['9f3c2a7d']);
    expect(searchCommits(commits, '9f3c2a7d').results.map((r) => r.hash)).toEqual(['9f3c2a7d']);
    expect(searchCommits(commits, 'f3c2').status).toBe('no-results');
  });

  it('finds commits by reference or tag name and by author date', () => {
    const commits = [
      commit('aaa111', 'One', { references: ['main', 'v2.0'], tags: ['v2.0'] }),
      commit('bbb222', 'Two', { authorDate: '2023-11-30T08:15:00+01:00' })
    ];
    expect(searchCommits(commits, 'V2.0').results.map((r) => r.hash)).toEqual(['aaa111']);
    expect(searchCommits(commits, '2023-11').results.map((r) => r.hash)).toEqual(['bbb222']);
  });

  it('reports a blank query as empty and an over-long query as invalid', () => {
    const commits = [commit('aaa111', 'One')];
    expect(searchCommits(commits, '   ')).toEqual({ status: 'empty', results: [] });
    const invalid = searchCommits(commits, 'x'.repeat(201));
    expect(invalid).toEqual({ status: 'invalid', results: [] });
  });

  it('treats regex characters literally and caps the number of results', () => {
    const commits = Array.from({ length: 250 }, (_, index) =>
      commit(`c${index}`, `Fix (a+) ${index}`)
    );
    commits.push(commit('zzz', 'Fix aaa'));
    const outcome = searchCommits(commits, '(a+)');
    expect(outcome.status).toBe('results');
    expect(outcome.results).toHaveLength(100);
    expect(outcome.truncated).toBe(true);
    expect(searchCommits(commits, 'fix aaa').truncated).toBe(false);
  });
});

describe('revealCommit', () => {
  const commits = [
    commit('main2', 'Main two', { parents: ['main1'], committerTimestamp: 1710000000 }),
    commit('main1', 'Main one', { parents: [], committerTimestamp: 1700000000 }),
    commit('feat1', 'Feature', { parents: ['main1'], committerTimestamp: 1705000000 })
  ];
  const graph = {
    commits,
    references: [
      { name: 'main', hash: 'main2' },
      { name: 'feature', hash: 'feat1' }
    ]
  };

  it('leaves the view unchanged when the commit is already reachable and in range', () => {
    const view = { visibleReferences: new Set(['main']), timeRange: null };
    const revealed = revealCommit(graph, 'main1', view);
    expect(revealed.changed).toBe(false);
    expect([...revealed.visibleReferences]).toEqual(['main']);
    expect(revealed.timeRange).toBeNull();
  });

  it('shows the first reference that reaches a commit hidden by the reference filter', () => {
    const view = { visibleReferences: new Set(['main']), timeRange: null };
    const revealed = revealCommit(graph, 'feat1', view);
    expect(revealed.changed).toBe(true);
    expect([...revealed.visibleReferences].sort()).toEqual(['feature', 'main']);
    expect([...view.visibleReferences]).toEqual(['main']);
  });

  it('narrows an out-of-range time range to the commit’s local day', () => {
    const timeRange = { start: 1709900000 * 1000, end: 1710100000 * 1000 };
    const view = { visibleReferences: new Set(['main']), timeRange };
    const revealed = revealCommit(graph, 'main1', view);
    const { start, end } = revealed.timeRange;
    expect(revealed.changed).toBe(true);
    expect(start).toBeLessThanOrEqual(1700000000 * 1000);
    expect(end).toBeGreaterThan(1700000000 * 1000);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(end).getHours()).toBe(0);
    expect(end - start).toBeGreaterThanOrEqual(23 * 3600 * 1000);
    expect(end - start).toBeLessThanOrEqual(25 * 3600 * 1000);
  });
});
