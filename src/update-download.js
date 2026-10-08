const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { DOWNLOAD_PREFIX } = require('./update-policy');

// Downloads a release asset to `directory` and returns its path. The file is kept only if its size
// and SHA-256 match what GitHub reports for the asset; `requireDigest` refuses assets without one.
async function downloadAsset({
  asset,
  directory,
  requireDigest = false,
  onProgress = () => {},
  fetchImpl = fetch,
  fileSystem = fs
}) {
  if (!asset.browser_download_url?.startsWith(DOWNLOAD_PREFIX)) {
    throw new Error('Only Mergentra GitHub release downloads are allowed.');
  }
  const expectedDigest = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest ?? '')?.[1].toLowerCase();
  if (requireDigest && !expectedDigest) {
    throw new Error('GitHub did not publish a checksum for this download, so it was not run.');
  }

  const response = await fetchImpl(asset.browser_download_url, {
    credentials: 'omit',
    signal: AbortSignal.timeout(30 * 60 * 1000)
  });
  if (!response.ok || !response.body) {
    throw new Error(`The download failed with HTTP ${response.status}.`);
  }

  fileSystem.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, path.basename(asset.name));
  const partial = `${destination}.partial`;
  const hash = crypto.createHash('sha256');
  let received = 0;
  const total = Number(asset.size) || Number(response.headers.get('content-length')) || 0;

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      async function* measure(source) {
        for await (const chunk of source) {
          hash.update(chunk);
          received += chunk.length;
          if (total) onProgress(Math.min(received / total, 1));
          yield chunk;
        }
      },
      fileSystem.createWriteStream(partial)
    );

    if (Number.isFinite(asset.size) && received !== asset.size) {
      throw new Error('The downloaded file is not the expected size.');
    }
    if (expectedDigest && hash.digest('hex') !== expectedDigest) {
      throw new Error('The downloaded file failed its checksum check, so it was discarded.');
    }
    fileSystem.renameSync(partial, destination);
  } catch (error) {
    fileSystem.rmSync(partial, { force: true });
    throw error;
  }
  return destination;
}

module.exports = { downloadAsset };
