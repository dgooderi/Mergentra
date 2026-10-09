import { describe, expect, it } from 'vitest';
import { compareReleaseVersions, parseReleaseVersion } from '../../src/release-version.js';

const compare = (left, right) =>
  compareReleaseVersions(parseReleaseVersion(left), parseReleaseVersion(right));

describe('parseReleaseVersion', () => {
  it('accepts an optional v prefix and build metadata', () => {
    expect(parseReleaseVersion('v1.2.3+build.5')).toEqual({
      major: 1n,
      minor: 2n,
      patch: 3n,
      prerelease: null
    });
  });

  it('splits a prerelease into identifiers', () => {
    expect(parseReleaseVersion('1.0.0-rc.1').prerelease).toEqual(['rc', '1']);
  });

  it('rejects versions that are not semantic versions', () => {
    expect(() => parseReleaseVersion('1.2')).toThrow('unsupported release version');
    expect(() => parseReleaseVersion('01.2.3')).toThrow('unsupported release version');
  });
});

describe('compareReleaseVersions', () => {
  it('orders by major, minor, then patch numerically', () => {
    expect(compare('1.0.0', '0.9.9')).toBe(1);
    expect(compare('0.10.0', '0.9.0')).toBe(1);
    expect(compare('0.9.1', '0.9.2')).toBe(-1);
    expect(compare('2.0.0', '2.0.0')).toBe(0);
  });

  it('ranks a release above its own prerelease', () => {
    expect(compare('1.0.0', '1.0.0-rc.1')).toBe(1);
    expect(compare('1.0.0-rc.1', '1.0.0')).toBe(-1);
  });

  it('compares prerelease identifiers by the semantic version rules', () => {
    expect(compare('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compare('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1);
    expect(compare('1.0.0-1', '1.0.0-alpha')).toBe(-1);
    expect(compare('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('handles versions larger than a safe integer', () => {
    expect(compare('9007199254740993.0.0', '9007199254740992.0.0')).toBe(1);
  });
});
