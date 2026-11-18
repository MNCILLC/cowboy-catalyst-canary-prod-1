import 'server-only';

import { z } from 'zod';

export function warehousePreviewEnabled() {
  // This milestone cannot redirect ordinary customers to an unfinished checkout.
  return process.env.NODE_ENV === 'development' && process.env.WAREHOUSE_PREVIEW_ENABLED === 'true';
}

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

export function getWarehouses() {
  if (!warehousePreviewEnabled()) return [];

  const values = z
    .array(warehouseSchema)
    .min(1)
    .parse(JSON.parse(process.env.WAREHOUSE_CONFIG ?? '[]'));

  if (
    new Set(values.map((w) => w.id)).size !== values.length ||
    new Set(values.map((w) => w.pickupMethodId)).size !== values.length
  )
    throw new Error('Warehouse IDs and pickup methods must be unique.');

  return values;
}
