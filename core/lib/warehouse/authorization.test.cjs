const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
// Compile only this pure module for Node's test runner; the application uses Next's build.
const filename = path.join(__dirname, 'authorization.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
const nativeRequire = compiled.require.bind(compiled);
compiled.require = (id) => nativeRequire(id === './policy' ? './policy.ts' : id);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { signValidationClaims, verifyValidationClaims, assertCurrentRecord } = compiled.exports;
const record = { version:1, storeHash:'store-a', channelId:11, cartId:'b941ba73-b094-4b9c-a288-6be664bc1aa8', warehouseId:'north', revision:'144a95b8-3272-4b1c-8195-12f35e10524b' };
const claims = { ...record, purpose:'warehouse-validation', origin:'https://checkout.example', exp:2000 };
const key = 'test-signing-secret-which-is-not-a-real-secret';
const token = signValidationClaims(claims,key);
test('valid capability is limited to its signed cart, store, channel and warehouse', () => assert.deepEqual(verifyValidationClaims(token,key,claims.origin,1000000),claims));
test('wrong origin, signing key, expired token and malformed token are rejected', () => {
 for (const args of [[token,key,'https://evil.example',1000000],[token,'other-key',claims.origin,1000000],[token,key,claims.origin,2000000],['invalid',key,claims.origin,1000000]]) assert.throws(()=>verifyValidationClaims(...args),{code:'UNAUTHORIZED'});
});
test('changing signed cart or warehouse payload fails authentication', () => {
 const edited=Buffer.from(JSON.stringify({...claims,warehouseId:'other'})).toString('base64url')+'.'+token.split('.')[1];
 assert.throws(()=>verifyValidationClaims(edited,key,claims.origin,1000000),{code:'UNAUTHORIZED'});
});
test('missing record and every changed identity or revision invalidate an old checkout', () => {
 assertCurrentRecord(record,record);
 for (const field of ['storeHash','channelId','cartId','warehouseId','revision']) assert.throws(()=>assertCurrentRecord({...record,[field]:'changed'},record),{code:'STALE_WAREHOUSE'});
 assert.throws(()=>assertCurrentRecord(undefined,record),{code:'STALE_WAREHOUSE'});
});
