// Local rehearsal infrastructure only. Never builds or edits application source.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function readArtifact(core, distDir) {
  const root = fs.realpathSync(core);
  const directory = path.resolve(root, distDir);

  if (!directory.startsWith(root + path.sep))
    throw new Error('Build directory must be inside the isolated app');

  const buildId = fs.readFileSync(path.join(directory, 'BUILD_ID'), 'utf8').trim();

  if (!buildId || buildId === 'development')
    throw new Error('A compiled build is required; two dev compilers are not interchangeable');

  const hash = createHash('sha256');

  ['BUILD_ID', 'build-manifest.json', 'server/server-reference-manifest.json'].forEach((name) => {
    hash.update(name);
    hash.update(fs.readFileSync(path.join(directory, name)));
  });

  return Object.freeze({ core: root, distDir, buildId, digest: hash.digest('hex') });
}

function validateLaunch(artifact, env, port) {
  assert.deepEqual(
    readArtifact(artifact.core, artifact.distDir),
    artifact,
    'Compiled artifact changed during rehearsal',
  );
  if (env.NODE_ENV !== 'production')
    throw new Error('Rehearsal instances must use next start with NODE_ENV=production');
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid local backend port');

  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(artifact.core, artifact.distDir, 'server/server-reference-manifest.json'),
      'utf8',
    ),
  );

  if (
    !env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ||
    manifest.encryptionKey !== env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
  ) {
    throw new Error('Backend action key must match the compiled artifact');
  }

  if (env.WAREHOUSE_REHEARSAL_DIST_DIR !== artifact.distDir)
    throw new Error('Backend must select the verified build directory');
}

function startBackend({ artifact, env, port, logFd }) {
  validateLaunch(artifact, env, port);

  const next = require.resolve('next/dist/bin/next', { paths: [artifact.core] });

  // Always loopback, no watcher, no per-instance compilation or source mutation.
  return spawn(
    process.execPath,
    [next, 'start', '--port', String(port), '--hostname', 'localhost'],
    {
      cwd: artifact.core,
      env,
      stdio: ['ignore', logFd, logFd],
      detached: true,
    },
  );
}

module.exports = { readArtifact, validateLaunch, startBackend };
