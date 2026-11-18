import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

import { recordSchema, WarehouseRecord, WarehouseValidationError } from '../authorization';

import { COMPARE_AND_SET_WAREHOUSE_SCRIPT, READ_WAREHOUSE_SCRIPT } from './redis-scripts';

/** A direct Redis EVAL transport, without caches, replica reads, or fallback. */
export interface WarehouseRedis {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

const scopeSchema = recordSchema
  .pick({ storeHash: true, channelId: true, cartId: true })
  .extend({
    storeHash: z.string().min(1).max(128),
    cartId: z.string().uuid().toLowerCase(),
    channelId: z.number().int().positive().safe(),
  })
  .strict();
const selectionSchema = scopeSchema
  .extend({
    warehouseId: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(128),
    expectedRevision: z.string().uuid().toLowerCase().nullable(),
    operationId: z.string().uuid().toLowerCase(),
  })
  .strict();

export type WarehouseScope = z.infer<typeof scopeSchema>;
export type WarehouseSelection = z.infer<typeof selectionSchema>;
export interface WarehouseSelectionReceipt {
  /** The original accepted result, even when a later selection now exists. */
  record: WarehouseRecord;
  /** Current authority at the atomic operation's execution point. */
  currentRecord: WarehouseRecord;
  replayed: boolean;
}

function storageError() {
  return new WarehouseValidationError(
    'Warehouse storage is unavailable. Retry the same selection operation.',
    503,
    'WAREHOUSE_STORAGE_UNAVAILABLE',
  );
}

function invalidRecord() {
  return new WarehouseValidationError(
    'Warehouse storage contains an invalid record.',
    503,
    'INVALID_RECORD',
  );
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new WarehouseValidationError(
      'Invalid warehouse selection request.',
      400,
      'INVALID_SELECTION_REQUEST',
    );
  }

  return result.data;
}

/** Storage only: the caller must authenticate cart ownership and validate stock first. */
export class AtomicWarehousePersistence {
  private readonly namespace: string;
  private readonly maxOperations: number;

  constructor(
    private readonly redis: WarehouseRedis,
    options: { namespace?: string; maxOperations?: number } = {},
  ) {
    this.namespace = z
      .string()
      .regex(/^[a-zA-Z0-9:_-]{1,80}$/)
      .parse(options.namespace ?? 'warehouse-selection:v1');
    this.maxOperations = z
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(options.maxOperations ?? 1024);
  }

  async read(input: WarehouseScope): Promise<WarehouseRecord | undefined> {
    const scope = parseInput(scopeSchema, input);
    const reply = await this.execute(READ_WAREHOUSE_SCRIPT, scope);

    if (reply[0] === 'missing' && reply.length === 1) return undefined;
    if (reply[0] !== 'ok' || reply.length !== 2) throw storageError();

    return this.decode(reply[1], scope);
  }

  async compareAndSet(input: WarehouseSelection): Promise<WarehouseSelectionReceipt> {
    const request = parseInput(selectionSchema, input);
    const { storeHash, channelId, cartId, warehouseId, expectedRevision, operationId } = request;
    const scope = { storeHash, channelId, cartId };
    const record: WarehouseRecord = { ...scope, version: 1, warehouseId, revision: randomUUID() };
    // Exclude the generated revision: retries of the same intent must match.
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([storeHash, channelId, cartId, warehouseId, expectedRevision]))
      .digest('hex');
    const reply = await this.execute(COMPARE_AND_SET_WAREHOUSE_SCRIPT, scope, [
      operationId,
      fingerprint,
      expectedRevision ?? '',
      JSON.stringify(record),
      String(this.maxOperations),
    ]);

    if (reply[0] !== 'ok' || reply.length !== 4 || !['0', '1'].includes(reply[3] ?? ''))
      throw storageError();

    return {
      record: this.decode(reply[1], scope),
      currentRecord: this.decode(reply[2], scope),
      replayed: reply[3] === '1',
    };
  }

  private key(scope: WarehouseScope) {
    const identity = JSON.stringify([scope.storeHash, scope.channelId, scope.cartId]);
    const hash = createHash('sha256').update(identity).digest('hex');

    return `${this.namespace}:{${hash}}`;
  }

  private async execute(script: string, scope: WarehouseScope, args: string[] = []) {
    let reply: unknown;

    try {
      reply = await this.redis.eval(
        script,
        [this.key(scope)],
        [scope.storeHash, String(scope.channelId), scope.cartId, ...args],
      );
    } catch {
      // Timeouts can occur after a commit. Never retry with a fresh operation ID.
      throw storageError();
    }

    if (!Array.isArray(reply) || !reply.every((value) => typeof value === 'string'))
      throw storageError();

    const values = reply;

    switch (values[0]) {
      case 'ok':
      case 'missing':
        return values;

      case 'stale':
        throw new WarehouseValidationError(
          'Your cart warehouse changed. Reload before choosing again.',
          409,
          'STALE_WAREHOUSE',
        );

      case 'operation_conflict':
        throw new WarehouseValidationError(
          'This selection operation was already used for a different request.',
          409,
          'OPERATION_CONFLICT',
        );

      case 'limit':
        throw new WarehouseValidationError(
          'This cart has reached its warehouse selection limit.',
          409,
          'SELECTION_LIMIT',
        );

      case 'invalid':
        throw invalidRecord();

      default:
        throw storageError();
    }
  }

  private decode(value: string | undefined, scope: WarehouseScope): WarehouseRecord {
    try {
      const record = recordSchema.parse(JSON.parse(value ?? ''));

      if (
        record.storeHash !== scope.storeHash ||
        record.channelId !== scope.channelId ||
        record.cartId !== scope.cartId
      )
        throw invalidRecord();

      return record;
    } catch {
      throw invalidRecord();
    }
  }
}
