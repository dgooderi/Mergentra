import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadAsset } from '../../src/update-download.js';

const BODY = Buffer.from('installer bytes');
const GOOD_DIGEST = `sha256:${crypto.createHash('sha256').update(BODY).digest('hex')}`;
let directory;

function asset(overrides = {}) {
  return {
    name: 'Mergentra-0.11.0-Setup.exe',
    size: BODY.length,
    digest: GOOD_DIGEST,
    browser_download_url:
      'https://github.com/dgooderi/Mergentra/releases/download/v0.11.0/Mergentra-0.11.0-Setup.exe',
    ...overrides
  };
}

const serve =
  (body = BODY, status = 200) =>
  async () =>
    new Response(body, { status });

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mergentra-download-'));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('downloadAsset', () => {
  it('saves a file whose size and checksum match and reports progress', async () => {
    const progress = [];
    const file = await downloadAsset({
      asset: asset(),
      directory,
      fetchImpl: serve(),
      onProgress: (fraction) => progress.push(fraction)
    });
    expect(fs.readFileSync(file)).toEqual(BODY);
    expect(path.basename(file)).toBe('Mergentra-0.11.0-Setup.exe');
    expect(progress.at(-1)).toBe(1);
  });

  it('discards a download whose checksum does not match', async () => {
    await expect(
      downloadAsset({
        asset: asset({ digest: `sha256:${'0'.repeat(64)}` }),
        directory,
        fetchImpl: serve()
      })
    ).rejects.toThrow(/checksum/);
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it('discards a download of the wrong size', async () => {
    await expect(
      downloadAsset({ asset: asset({ size: 3, digest: undefined }), directory, fetchImpl: serve() })
    ).rejects.toThrow(/size/);
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it('refuses to fetch from anywhere but the project release downloads', async () => {
    await expect(
      downloadAsset({
        asset: asset({ browser_download_url: 'https://evil.example/a.exe' }),
        directory,
        fetchImpl: serve()
      })
    ).rejects.toThrow(/release downloads/);
  });

  it('refuses an asset without a published checksum when one is required', async () => {
    await expect(
      downloadAsset({
        asset: asset({ digest: undefined }),
        directory,
        requireDigest: true,
        fetchImpl: serve()
      })
    ).rejects.toThrow(/checksum/);
  });

  it('reports an HTTP failure', async () => {
    await expect(
      downloadAsset({ asset: asset(), directory, fetchImpl: serve('no', 404) })
    ).rejects.toThrow(/HTTP 404/);
  });
});
