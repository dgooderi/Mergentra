import { describe, expect, it } from 'vitest';
import { computeBranchHealth } from '../../src/renderer/branch-health.js';

function commit(hash, parents, committerTimestamp) {
  return { hash, parents, committerTimestamp };
}

function graphOf(commits, references, extra = {}) {
  return { commits, references, shallowBoundaries: [], missingObjectBoundaries: [], ...extra };
}

function local(name, hash) {
  return { name, hash, remote: false };
}

// base <- m1 <- m2 (main);  base <- f1 <- f2 (feature)
const forkedCommits = [
  commit('f2', ['f1'], 500),
  commit('m2', ['m1'], 400),
  commit('f1', ['base'], 300),
  commit('m1', ['base'], 200),
  commit('base', [], 100)
];
const forkedReferences = [local('main', 'm2'), local('feature', 'f2')];

describe('computeBranchHealth', () => {
  it('counts the commits a branch has that the target lacks and the commits it is missing', () => {
    const report = computeBranchHealth(graphOf(forkedCommits, forkedReferences), 'main');
    const feature = report.rows.find((row) => row.name === 'feature');
    expect(feature).toMatchObject({ status: 'diverged', ahead: 2, behind: 2 });
  });

  it('infers the divergence commit, its shared parent and the date of the last commit', () => {
    const report = computeBranchHealth(graphOf(forkedCommits, forkedReferences), 'main');
    const feature = report.rows.find((row) => row.name === 'feature');
    expect(feature).toMatchObject({
      divergenceHash: 'f1',
      forkPointHash: 'base',
      lastCommitTimestamp: 500
    });
  });

  it('explains why the target branch has no comparison with itself', () => {
    const report = computeBranchHealth(graphOf(forkedCommits, forkedReferences), 'main');
    const main = report.rows.find((row) => row.name === 'main');
    expect(main).toMatchObject({ status: 'target', ahead: null, behind: null });
    expect(main.explanation).toBe('This is the target branch, so there is nothing to compare.');
  });

  it('explains a branch whose commits are all already in the target', () => {
    const references = [local('main', 'm2'), local('stale', 'm1')];
    const report = computeBranchHealth(graphOf(forkedCommits, references), 'main');
    const stale = report.rows.find((row) => row.name === 'stale');
    expect(stale).toMatchObject({
      status: 'contained',
      ahead: 0,
      behind: 1,
      divergenceHash: null
    });
    expect(stale.explanation).toBe(
      'Every commit on this branch is already in the target, so it has no unique commits.'
    );
  });

  it('explains a branch that points at the same commit as the target', () => {
    const references = [local('main', 'm2'), local('twin', 'm2')];
    const report = computeBranchHealth(graphOf(forkedCommits, references), 'main');
    const twin = report.rows.find((row) => row.name === 'twin');
    expect(twin).toMatchObject({ status: 'same-commit', ahead: 0, behind: 0 });
    expect(twin.explanation).toBe('This branch points at the same commit as the target.');
  });

  it('explains a branch that shares no history with the target', () => {
    const commits = [...forkedCommits, commit('o2', ['o1'], 600), commit('o1', [], 50)];
    const references = [...forkedReferences, local('orphan', 'o2')];
    const report = computeBranchHealth(graphOf(commits, references), 'main');
    const orphan = report.rows.find((row) => row.name === 'orphan');
    expect(orphan).toMatchObject({
      status: 'unrelated',
      ahead: 2,
      behind: 3,
      divergenceHash: null
    });
    expect(orphan.explanation).toBe('This branch shares no history with the target.');
    expect(orphan.uncertain).toBe(false);
  });

  it('flags the comparison as uncertain when shallow history is reachable', () => {
    const shallow = graphOf(forkedCommits, forkedReferences, { shallowBoundaries: ['base'] });
    const feature = computeBranchHealth(shallow, 'main').rows.find((row) => row.name === 'feature');
    expect(feature.uncertain).toBe(true);
    expect(feature.uncertainty).toBe(
      'History is shallow or incomplete here, so these counts and the divergence point may be inaccurate.'
    );
  });

  it('flags the comparison as uncertain when a parent object is missing', () => {
    const partial = graphOf(forkedCommits, forkedReferences, { missingObjectBoundaries: ['f1'] });
    const rows = computeBranchHealth(partial, 'main').rows;
    expect(rows.find((row) => row.name === 'feature').uncertain).toBe(true);
    expect(rows.find((row) => row.name === 'main').uncertain).toBe(false);
  });

  it('compares against the main line when no target branch is selected', () => {
    const report = computeBranchHealth(graphOf(forkedCommits, forkedReferences), null);
    expect(report.targetName).toBe('main');
    expect(report.rows.find((row) => row.name === 'feature')).toMatchObject({ ahead: 2 });
  });

  it('explains why there is nothing to compare without a target or an empty repository', () => {
    const noMain = graphOf(forkedCommits, [local('feature', 'f2')]);
    expect(computeBranchHealth(noMain, null)).toEqual({
      targetName: null,
      rows: [],
      explanation: 'Select a target branch to compare the other branches against.'
    });
    expect(computeBranchHealth(graphOf([], []), null)).toEqual({
      targetName: null,
      rows: [],
      explanation: 'This repository has no commits yet, so there are no branches to compare.'
    });
  });

  it('orders the most diverged branches first, then the stalest, then the ones without a comparison', () => {
    const commits = [commit('a1', ['m2'], 450), commit('b1', ['m2'], 420), ...forkedCommits];
    const references = [
      local('main', 'm2'),
      local('a-fresh', 'a1'),
      local('stale', 'm1'),
      local('b-old', 'b1'),
      local('feature', 'f2')
    ];
    const names = computeBranchHealth(graphOf(commits, references), 'main').rows.map(
      (row) => row.name
    );
    expect(names).toEqual(['feature', 'b-old', 'a-fresh', 'stale', 'main']);
  });

  it('stays fast on a 50,000-commit history with 100 branches', () => {
    const commits = [];
    for (let index = 49_899; index >= 0; index -= 1) {
      commits.push(commit(`c${index}`, index > 0 ? [`c${index - 1}`] : [], index));
    }
    const references = [local('main', 'c49899')];
    for (let branch = 0; branch < 100; branch += 1) {
      commits.push(commit(`b${branch}`, [`c${branch * 400}`], 60_000 + branch));
      references.push(local(`branch-${branch}`, `b${branch}`));
    }
    const started = performance.now();
    const report = computeBranchHealth(graphOf(commits, references), 'main');
    expect(performance.now() - started).toBeLessThan(3000);
    expect(report.rows.find((row) => row.name === 'branch-2')).toMatchObject({
      ahead: 1,
      behind: 49_899 - 800,
      divergenceHash: 'b2',
      forkPointHash: 'c800'
    });
  });
});
