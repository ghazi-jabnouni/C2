import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { cloneGitRepository } from './git-auth.js';

function runWget(url, destination) {
  return new Promise((resolve, reject) => {
    const wget = spawn('wget', [
      '--quiet',
      '--output-document', destination,
      '--timeout=30',
      '--tries=1',
      url
    ], { windowsHide: true });
    wget.once('error', (error) => {
      if (error.code === 'ENOENT') return resolve(false);
      reject(error);
    });
    wget.once('close', (code) => {
      if (code === 0) return resolve(true);
      reject(new Error(`wget failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}

export async function downloadHttpFile(url, destination) {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('HTTP file sources must use an HTTP or HTTPS URL.');
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('Do not put a username or password in the HTTP file URL.');
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const downloadedWithWget = await runWget(parsedUrl.toString(), destination);
  if (downloadedWithWget) return destination;

  const response = await fetch(parsedUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`HTTP download failed with status ${response.status}.`);
  }
  if (!response.body) throw new Error('HTTP response did not contain a file body.');
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination, { mode: 0o600 }));
  return destination;
}

export async function retrieveRepositorySource({
  sourceType = 'git',
  url,
  branch,
  destination,
  credential,
  fileName,
  onOutput
}) {
  if (sourceType !== 'http') {
    await cloneGitRepository({
      gitUrl: url,
      branch,
      destination,
      credential,
      onOutput
    });
    return destination;
  }

  const parsedUrl = new URL(url);
  const downloadedName = path.basename(fileName || decodeURIComponent(parsedUrl.pathname) || 'downloaded-file') || 'downloaded-file';
  const downloadedPath = path.join(destination, downloadedName);
  await downloadHttpFile(url, downloadedPath);
  onOutput?.(`Downloaded HTTP file: ${downloadedName}`, 'stdout');
  return downloadedPath;
}
