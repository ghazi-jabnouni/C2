import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function sanitizeGitUrl(gitUrl) {
  const value = String(gitUrl || '');
  if (/^[^/@:]+@[^/:]+:.+$/.test(value)) return value;
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch (_) {
    return value;
  }
}

export function createGitAuthContext(gitUrl, credential) {
  const env = { GIT_TERMINAL_PROMPT: '0' };
  if (!credential) return { env, cleanup: () => {} };
  const password = credential.type === 'git_token'
    ? credential.secretToken
    : credential.type === 'git_password'
      ? credential.password
      : null;
  if (!password) {
    throw new Error('Repository authentication requires a Git Login + Token or Git Login + Password credential.');
  }
  if (!credential.username) {
    throw new Error('The Git credential must include a login.');
  }

  const remoteUrl = new URL(gitUrl);
  if (!['http:', 'https:'].includes(remoteUrl.protocol)) {
    throw new Error('Git login/password credentials require an HTTP or HTTPS repository URL.');
  }

  const authDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'automaton-git-auth-'));
  const credentialUrl = new URL(remoteUrl);
  credentialUrl.username = credential.username;
  credentialUrl.password = password;
  credentialUrl.hash = '';
  fs.writeFileSync(path.join(authDirectory, '.git-credentials'), `${credentialUrl.toString()}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
  const configPath = path.join(authDirectory, '.gitconfig');
  fs.writeFileSync(configPath, '[credential]\n\thelper = store\n\tuseHttpPath = true\n', {
    encoding: 'utf8',
    mode: 0o600
  });

  return {
    env: {
      ...env,
      HOME: authDirectory,
      USERPROFILE: authDirectory,
      XDG_CONFIG_HOME: authDirectory,
      GIT_CONFIG_GLOBAL: configPath,
      GIT_CONFIG_NOSYSTEM: '1'
    },
    cleanup: () => fs.rmSync(authDirectory, { recursive: true, force: true })
  };
}

export function cloneGitRepository({ gitUrl, branch, destination, credential, onOutput }) {
  const safeGitUrl = sanitizeGitUrl(gitUrl);
  const authContext = createGitAuthContext(safeGitUrl, credential);
  const redact = (text) => String(text)
    .replaceAll(credential?.secretToken || '\0', '[REDACTED]')
    .replaceAll(credential?.password || '\0', '[REDACTED]')
    .replaceAll(credential?.username || '\0', '[REDACTED]');

  return new Promise((resolve, reject) => {
    const clone = spawn('git', ['clone', '--depth', '1', '-b', branch || 'main', safeGitUrl, destination], {
      env: { ...process.env, ...authContext.env },
      windowsHide: true
    });
    let stderr = '';
    const forward = (stream, chunk) => {
      String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => {
        const safeLine = redact(line);
        if (stream === 'stderr') stderr += `${safeLine}\n`;
        onOutput?.(safeLine, stream);
      });
    };
    clone.stdout.on('data', (chunk) => forward('stdout', chunk));
    clone.stderr.on('data', (chunk) => forward('stderr', chunk));
    clone.on('error', (error) => {
      authContext.cleanup();
      reject(new Error(redact(error.message)));
    });
    clone.on('close', (code) => {
      authContext.cleanup();
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `git clone failed with exit code ${code ?? 'unknown'}.`));
    });
  });
}
