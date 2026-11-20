import 'server-only';

import { z } from 'zod';

import { warehouseApi } from './api';
import { getWarehouseConfiguration } from './config';
import { WarehouseError } from './policy';

export async function assertWarehouseCheckoutReady(rehearsal: boolean) {
  const configuration = getWarehouseConfiguration();

  if (configuration.mode === 'preview' && !rehearsal)
    throw new WarehouseError('Open the isolated preview browser to continue to checkout.');

  if (configuration.mode !== 'development' && (configuration.mode !== 'staging' || rehearsal))
    return;

  const loader = 'http://localhost:8080/auto-loader-dev.js';

  try {
    const settings = await warehouseApi<{
      checkout_type: string;
      custom_checkout_script_url: string;
    }>(`checkouts/settings/channels/${configuration.channelId}`);

    if (settings.checkout_type !== 'custom' || !settings.custom_checkout_script_url)
      throw new Error('Custom checkout is not activated.');

    if (configuration.mode === 'staging') return;

    if (settings.custom_checkout_script_url !== loader)
      throw new Error('Local checkout is not activated.');

    const response = await fetch('http://localhost:8080/warehouse-build.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    const manifest = z
      .object({
        mode: z.string(),
        stores: z.array(
          z.object({
            checkoutOrigin: z.string(),
            validationEndpoint: z.string(),
            initializationEndpoint: z.string().optional(),
          }),
        ),
      })
      .parse(await response.json());

    if (
      !response.ok ||
      manifest.mode !== 'development' ||
      !configuration.checkoutOrigins.every((origin) =>
        manifest.stores.some(
          (store) =>
            store.checkoutOrigin === origin &&
            store.validationEndpoint === 'http://localhost:3000/api/warehouse/validate' &&
            store.initializationEndpoint === 'http://localhost:3000/warehouse-initialize/',
        ),
      )
    )
      throw new Error('Wrong local bundle.');
  } catch {
    if (configuration.mode === 'staging')
      throw new WarehouseError(
        'Custom warehouse checkout is unavailable. Please return to your cart.',
      );

    throw new WarehouseError(
      'Start the local custom checkout on port 8080 and verify its sandbox activation before continuing.',
    );
  }
}
