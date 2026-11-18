const { execFile } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { promisify } = require('node:util');
const ts = require('typescript');

const run = promisify(execFile);

// Deliberate dependency allowlist: importing the live API, storefront, env loader,
// cache, or HTTP clients is an immediate test failure.
function loadAdapter() {
  const modules = new Map();

  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;

    const compiled = new Module(file, module);

    modules.set(file, compiled);
    compiled.filename = file;
    compiled.paths = module.paths;

    compiled.require = (id) => {
      if (id === 'server-only') return {};
      if (id === 'node:crypto') return require('node:crypto');
      if (id === 'zod') return require('zod');

      if (['../authorization', '../policy', './policy', './redis-scripts'].includes(id)) {
        return load(path.resolve(path.dirname(file), `${id}.ts`));
      }

      throw new Error(`Forbidden test dependency: ${id}`);
    };

    // eslint-disable-next-line no-underscore-dangle -- Compile only the allowlisted TS modules in memory.
    compiled._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      file,
    );

    return compiled.exports;
  }

  return {
    ...load(path.join(__dirname, 'persistence.ts')),
    ...load(path.join(__dirname, '../authorization.ts')),
  };
}

function redisClient(binary, socket) {
  if (!path.isAbsolute(binary) || !path.isAbsolute(socket))
    throw new Error('Explicit local paths required');

  return {
    async command(...args) {
      // A private Unix socket only. No TCP host, URL, credentials, or store config.
      const { stdout } = await run(binary, ['-s', socket, '--json', ...args.map(String)], {
        timeout: 3000,
        maxBuffer: 1024 * 1024,
      });

      return JSON.parse(stdout);
    },
    eval(script, keys, args) {
      return this.command('EVAL', script, keys.length, ...keys, ...args);
    },
  };
}

module.exports = { loadAdapter, redisClient };
