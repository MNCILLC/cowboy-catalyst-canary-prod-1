import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertStock, warehouseFulfillmentCompatible } from './policy.ts';

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

const warehouse = {id:'north',label:'North',pickupLabel:'North pickup',locationId:5,pickupMethodId:8,allowShipping:false};
const draft = {id:'consignment',line_item_ids:['item']};
test('unfinished fulfillment can recover after cart edits, but wrong pickup and shipping are rejected', () => {
 assert.equal(warehouseFulfillmentCompatible(warehouse,['item'],[draft]),true);
 assert.equal(warehouseFulfillmentCompatible(warehouse,['item'],[{...draft,selected_pickup_option:{pickup_method_id:8}}]),true);
 assert.equal(warehouseFulfillmentCompatible(warehouse,['item'],[{...draft,selected_pickup_option:{pickup_method_id:9}}]),false);
 assert.equal(warehouseFulfillmentCompatible(warehouse,['item'],[{...draft,selected_shipping_option:{type:'shipping_carrier'}}]),false);
 assert.equal(warehouseFulfillmentCompatible({...warehouse,allowShipping:true},['item'],[{...draft,selected_shipping_option:{type:'shipping_carrier'}}]),true);
 assert.equal(warehouseFulfillmentCompatible({...warehouse,allowShipping:true},['item'],[{...draft,selected_shipping_option:{type:'shipping_pickupinstore'}}]),false);
});
test('duplicate, foreign and partial assignments cannot count as compatible fulfillment', () => {
 assert.equal(warehouseFulfillmentCompatible(warehouse,['item'],[draft,draft]),false);
 assert.equal(warehouseFulfillmentCompatible(warehouse,['other'],[draft]),false);
 assert.equal(warehouseFulfillmentCompatible(warehouse,['item','other'],[{...draft,selected_pickup_option:{pickup_method_id:8}}]),false);
});
