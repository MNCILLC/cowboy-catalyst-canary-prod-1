import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertStock } from './policy.ts';

test('aggregates separate cart lines that share product inventory', () => {
  assert.throws(() => assertStock([{key:'p:1',name:'A',quantity:2},{key:'p:1',name:'A',quantity:2}],new Map([['p:1',3]]),'North'), /3 available.*4 requested/);
});
test('accepts exact stock and keeps variants independent', () => {
  assertStock([{key:'v:1',name:'A',quantity:2},{key:'v:2',name:'B',quantity:1}],new Map([['v:1',2],['v:2',1]]),'North');
});
test('missing inventory and non-finite stock fail closed', () => {
  for(const stock of [undefined,NaN,Infinity]) assert.throws(() => assertStock([{key:'p:1',name:'A',quantity:1}], stock===undefined?new Map():new Map([['p:1',stock]]),'North'));
});
test('invalid quantities cannot bypass inventory checks', () => {
  for(const quantity of [0,-1,1.5,NaN,Infinity]) assert.throws(() => assertStock([{key:'p:1',name:'A',quantity}],new Map([['p:1',3]]),'North'));
});
