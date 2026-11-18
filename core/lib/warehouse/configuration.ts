import { z } from 'zod';

const warehouseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    label: z.string().min(1),
    pickupLabel: z.string().min(1),
    locationId: z.number().int().positive(),
    pickupMethodId: z.number().int().positive(),
    allowShipping: z.boolean(),
  })
  .strict();

const httpsOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
});

// Pure parsing: no provider connections, environment reads, or secret values in errors.
export function readWarehouseConfiguration(env: Record<string, string | undefined>) {
  try {
    const explicit = env.WAREHOUSE_MODE;
    let mode: 'off' | 'preview' | 'staging' | 'development';

    if (explicit !== undefined) mode = z.enum(['off', 'staging', 'development']).parse(explicit);
    else if (env.NODE_ENV === 'development' && env.WAREHOUSE_PREVIEW_ENABLED === 'true')
      mode = 'preview';
    else mode = 'off';

    if (mode === 'development' && env.NODE_ENV !== 'development')
      throw new Error('Local checkout requires the development server.');

    if (mode === 'off') {
      const emptyWarehouses: Array<z.infer<typeof warehouseSchema>> = [];

      return { mode, warehouses: emptyWarehouses, checkoutOrigins: [] } as const;
    }

    const warehouses = z
      .array(warehouseSchema)
      .min(1)
      .parse(JSON.parse(env.WAREHOUSE_CONFIG ?? '[]'));

    if (
      new Set(warehouses.map((w) => w.id)).size !== warehouses.length ||
      new Set(warehouses.map((w) => w.pickupMethodId)).size !== warehouses.length
    )
      throw new Error('Duplicate warehouse configuration');

    if (mode === 'preview') return { mode, warehouses, checkoutOrigins: [] } as const;

    z.literal('redis').parse(env.WAREHOUSE_PERSISTENCE_PROVIDER);
    httpsOrigin.parse(env.WAREHOUSE_REDIS_URL?.replace(/\/$/, ''));
    z.string().trim().min(1).parse(env.WAREHOUSE_REDIS_TOKEN);
    z.string()
      .regex(/^[a-zA-Z0-9:_-]{1,80}$/)
      .parse(env.WAREHOUSE_REDIS_NAMESPACE);
    z.string().trim().min(32).parse(env.WAREHOUSE_VALIDATION_SECRET);

    const validationOrigin =
      mode === 'development'
        ? z.literal('http://localhost:3000').parse(env.WAREHOUSE_VALIDATION_BASE_URL)
        : httpsOrigin.parse(env.WAREHOUSE_VALIDATION_BASE_URL);
    const checkoutOrigins = z
      .array(httpsOrigin)
      .min(1)
      .parse(JSON.parse(env.WAREHOUSE_CHECKOUT_ORIGINS ?? '[]'));
    const storeHash = z.string().min(1).parse(env.BIGCOMMERCE_STORE_HASH);
    const channelId = z.coerce.number().int().positive().safe().parse(env.BIGCOMMERCE_CHANNEL_ID);

    return { mode, warehouses, checkoutOrigins, validationOrigin, storeHash, channelId } as const;
  } catch {
    throw new Error('Invalid warehouse configuration. Check the server staging configuration.');
  }
}
