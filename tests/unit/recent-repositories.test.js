import { describe, expect, it } from 'vitest';
import recentModule from '../../src/recent-repositories.js';

const { MAX_RECENT_REPOSITORIES, rememberRepository, forgetRepository } = recentModule;

const repo = (name) => ({ path: `C:\\repos\\${name}`, name });

describe('recent repositories', () => {
  it('holds a maximum of 10', () => {
    expect(MAX_RECENT_REPOSITORIES).toBe(10);
  });

  it('puts the newest repository first and drops the oldest beyond the limit', () => {
    let recent = [];
    for (let index = 1; index <= 11; index += 1) {
      recent = rememberRepository(recent, repo(`r${index}`), { caseInsensitive: true });
    }

    expect(recent).toHaveLength(10);
    expect(recent[0].name).toBe('r11');
    expect(recent.at(-1).name).toBe('r2');
  });

  it('moves a reopened repository to the front instead of duplicating it', () => {
    const recent = rememberRepository([repo('a'), repo('b'), repo('c')], repo('c'), {
      caseInsensitive: false
    });

    expect(recent.map((entry) => entry.name)).toEqual(['c', 'a', 'b']);
  });

  it('treats paths that differ only by case as the same repository when case-insensitive', () => {
    const reopened = { path: 'c:\\REPOS\\A', name: 'A' };

    const insensitive = rememberRepository([repo('a')], reopened, { caseInsensitive: true });
    const sensitive = rememberRepository([repo('a')], reopened, { caseInsensitive: false });

    expect(insensitive).toEqual([reopened]);
    expect(sensitive).toHaveLength(2);
  });

  it('forgets one repository without touching the others', () => {
    const recent = forgetRepository([repo('a'), repo('b'), repo('c')], repo('b').path, {
      caseInsensitive: true
    });

    expect(recent.map((entry) => entry.name)).toEqual(['a', 'c']);
  });
});
