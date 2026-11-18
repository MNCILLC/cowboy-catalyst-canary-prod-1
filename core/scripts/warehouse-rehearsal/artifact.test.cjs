const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { readArtifact, validateLaunch } = require('./artifact.cjs');

test('both instances require one unchanged compiled artifact and its action key', (t) => {
  const core = fs.mkdtempSync(path.join(os.tmpdir(), 'warehouse-artifact-'));

  t.after(() => fs.rmSync(core, { recursive: true, force: true }));

  const distDir = '.next-rehearsal';

  fs.mkdirSync(path.join(core, distDir, 'server'), { recursive: true });
  fs.writeFileSync(path.join(core, distDir, 'BUILD_ID'), 'same-build');
  fs.writeFileSync(path.join(core, distDir, 'build-manifest.json'), '{}');
  fs.writeFileSync(
    path.join(core, distDir, 'server/server-reference-manifest.json'),
    JSON.stringify({ encryptionKey: 'synthetic-build-key' }),
  );

  const artifact = readArtifact(core, distDir);
  const env = {
    NODE_ENV: 'production',
    WAREHOUSE_REHEARSAL_DIST_DIR: distDir,
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 'synthetic-build-key',
  };

  assert.doesNotThrow(() => validateLaunch(artifact, env, 3013));
  assert.doesNotThrow(() => validateLaunch(artifact, env, 3014));
  assert.throws(
    () => validateLaunch(artifact, { ...env, NODE_ENV: 'development' }, 3013),
    /next start/,
  );
  assert.throws(
    () =>
      validateLaunch(artifact, { ...env, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: 'different' }, 3014),
    /action key/,
  );
  assert.throws(
    () => validateLaunch(artifact, { ...env, WAREHOUSE_REHEARSAL_DIST_DIR: '.next-other' }, 3014),
    /build directory/,
  );
  fs.writeFileSync(path.join(core, distDir, 'build-manifest.json'), '{"different":true}');
  assert.throws(() => validateLaunch(artifact, env, 3014), /artifact changed/);
  fs.writeFileSync(path.join(core, distDir, 'BUILD_ID'), 'development');
  assert.throws(() => readArtifact(core, distDir), /compiled build/);
});
