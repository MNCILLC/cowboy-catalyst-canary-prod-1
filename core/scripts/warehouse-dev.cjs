const path = require('node:path');
const { spawn } = require('node:child_process');
const dotenv = require('dotenv');
const core = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(core, '../.env.local'), quiet: true });
dotenv.config({ path: path.join(core, '.env.local'), quiet: true });
// This file is an editable sandbox example, not a production default.
dotenv.config({ path: process.env.WAREHOUSE_ENV_FILE || path.join(core, '.env.warehouse.example'), override: true, quiet: true });
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--port', process.env.WAREHOUSE_PREVIEW_PORT || '3011'], { cwd: core, env: process.env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code || 0));
