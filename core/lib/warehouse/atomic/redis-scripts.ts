// All state and operation receipts share one Redis hash. EVAL performs the check
// and a single multi-field HSET; no lease, process-local cache, or second store.
const validateHead = `
local function uuid(value)
  return type(value) == 'string' and #value == 36
    and string.match(value, '^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$')
end
local function valid(record)
  if type(record) ~= 'table' then return false end
  local count = 0
  for _ in pairs(record) do count = count + 1 end
  return count == 6 and record.version == 1 and record.storeHash == ARGV[1]
    and record.channelId == tonumber(ARGV[2]) and record.cartId == ARGV[3]
    and uuid(record.revision) and type(record.warehouseId) == 'string'
    and #record.warehouseId > 0 and #record.warehouseId <= 128
    and string.match(record.warehouseId, '^[a-z0-9%-]+$')
end
local current = redis.call('HGET', KEYS[1], 'record')
local head = nil
if current then
  local parsed, value = pcall(cjson.decode, current)
  if not parsed or not valid(value) or redis.call('PTTL', KEYS[1]) ~= -1 then
    return {'invalid'}
  end
  head = value
elseif redis.call('EXISTS', KEYS[1]) == 1 then
  return {'invalid'}
end
`;

export const READ_WAREHOUSE_SCRIPT = `${validateHead}
if not current then return {'missing'} end
return {'ok', current}
`;

export const COMPARE_AND_SET_WAREHOUSE_SCRIPT = `${validateHead}
local operationField = 'operation:' .. ARGV[4]
local previous = redis.call('HGET', KEYS[1], operationField)
if previous then
  local parsed, receipt = pcall(cjson.decode, previous)
  if not parsed or type(receipt) ~= 'table' or type(receipt.fingerprint) ~= 'string'
    or type(receipt.record) ~= 'string' then return {'invalid'} end
  local recordParsed, accepted = pcall(cjson.decode, receipt.record)
  if not recordParsed or not valid(accepted) then return {'invalid'} end
  if receipt.fingerprint ~= ARGV[5] then return {'operation_conflict'} end
  return {'ok', receipt.record, current, '1'}
end
local expected = ARGV[6]
if (head and head.revision or '') ~= expected then return {'stale'} end
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[8]) + 1 then return {'limit'} end
local parsed, nextRecord = pcall(cjson.decode, ARGV[7])
if not parsed or not valid(nextRecord) then return {'invalid'} end
local receipt = cjson.encode({fingerprint = ARGV[5], record = ARGV[7]})
redis.call('HSET', KEYS[1], 'record', ARGV[7], operationField, receipt)
return {'ok', ARGV[7], ARGV[7], '0'}
`;
