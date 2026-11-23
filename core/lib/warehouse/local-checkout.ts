import 'server-only';

import { z } from 'zod';

import { warehouseApi } from './api';
import { getWarehouseConfiguration } from './config';
import { WarehouseError } from './policy';

interface CheckoutSettings {
  checkout_type: string | null;
  custom_checkout_script_url: string | null;
}

async function getEffectiveCheckoutSettings(channelId: number) {
  const channel = await warehouseApi<CheckoutSettings>(`checkouts/settings/channels/${channelId}`);

  if (channel.checkout_type !== null && channel.custom_checkout_script_url !== null) return channel;

  const store = await warehouseApi<CheckoutSettings>('checkouts/settings');

  return {
    checkout_type: channel.checkout_type ?? store.checkout_type,
    custom_checkout_script_url:
      channel.custom_checkout_script_url ?? store.custom_checkout_script_url,
  };
}

export async function assertWarehouseCheckoutReady(rehearsal: boolean) {
  const configuration = getWarehouseConfiguration();

  if (configuration.mode === 'preview' && !rehearsal)
    throw new WarehouseError('Open the isolated preview browser to continue to checkout.');

  if (configuration.mode !== 'development' && (configuration.mode !== 'staging' || rehearsal))
    return;

  const settings = await getEffectiveCheckoutSettings(configuration.channelId).catch(() => {
    throw new WarehouseError('Unable to read the BigCommerce checkout settings. Please retry.');
  });

  const loader = settings.custom_checkout_script_url;

  if (settings.checkout_type !== 'custom' || !loader)
    throw new WarehouseError('Custom checkout is not configured for this storefront.');

  if (configuration.mode === 'staging') return;

  if (
    loader !== 'http://localhost:8080/auto-loader-dev.js' &&
    !(loader === process.env.WAREHOUSE_DEV_CHECKOUT_LOADER_URL && loader.startsWith('https://'))
  )
    throw new WarehouseError(
      'The BigCommerce checkout script does not match the local development loader. Check WAREHOUSE_DEV_CHECKOUT_LOADER_URL in Catalyst.',
    );

  try {
    const response = await fetch(new URL('warehouse-build.json', loader).href, {
      cache: 'no-store',
      redirect: 'error',
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
    throw new WarehouseError(
      'Unable to verify the development checkout build. Check warehouse-build.json alongside the configured checkout script.',
    );
  }
}
