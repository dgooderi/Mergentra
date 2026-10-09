import { describe, expect, it } from 'vitest';
import { isAcceptedByPolicy, needsAcceptance, recordAcceptance } from '../../src/license.js';

describe('needsAcceptance', () => {
  it('requires acceptance when the terms were never accepted', () => {
    expect(needsAcceptance({}, 1)).toBe(true);
  });

  it('does not ask again for the version already accepted', () => {
    expect(needsAcceptance({ acceptedLicenseVersion: 1 }, 1)).toBe(false);
  });

  it('asks again when the bundled terms are newer than the accepted ones', () => {
    expect(needsAcceptance({ acceptedLicenseVersion: 1 }, 2)).toBe(true);
  });

  it('ignores a stored value that is not a version number', () => {
    expect(needsAcceptance({ acceptedLicenseVersion: '1' }, 1)).toBe(true);
    expect(needsAcceptance({ acceptedLicenseVersion: null }, 1)).toBe(true);
  });
});

describe('recordAcceptance', () => {
  it('stores the licence version, date and app version without losing other settings', () => {
    const now = Date.UTC(2026, 9, 9, 12);
    expect(
      recordAcceptance(
        { gitPath: 'git', recentRepositories: [] },
        { licenseVersion: 2, appVersion: '0.11.0', now }
      )
    ).toEqual({
      gitPath: 'git',
      recentRepositories: [],
      acceptedLicenseVersion: 2,
      acceptedLicenseDate: '2026-10-09T12:00:00.000Z',
      acceptedLicenseAppVersion: '0.11.0'
    });
  });
});

describe('isAcceptedByPolicy', () => {
  it('accepts when an administrator sets the policy to this version or later', () => {
    expect(isAcceptedByPolicy({ MERGENTRA_ACCEPT_LICENSE: '1' }, 1)).toBe(true);
    expect(isAcceptedByPolicy({ MERGENTRA_ACCEPT_LICENSE: '3' }, 2)).toBe(true);
  });

  it('asks again when the terms are newer than the version the administrator accepted', () => {
    expect(isAcceptedByPolicy({ MERGENTRA_ACCEPT_LICENSE: '1' }, 2)).toBe(false);
  });

  it('does not accept without a policy or with an unusable value', () => {
    expect(isAcceptedByPolicy({}, 1)).toBe(false);
    expect(isAcceptedByPolicy({ MERGENTRA_ACCEPT_LICENSE: 'yes' }, 1)).toBe(false);
    expect(isAcceptedByPolicy({ MERGENTRA_ACCEPT_LICENSE: '' }, 1)).toBe(false);
  });
});
