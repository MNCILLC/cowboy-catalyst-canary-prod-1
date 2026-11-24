import 'server-only';

import { z } from 'zod';

import { testProviderDenied } from './test-provider';

// Read-only provider check. V2 can omit providers; absence is a denial, never permission.
// The exact internal test provider is the only accepted identity, not a display label.
export async function readTestPaymentMethods(storeHash: string) {
  const token = process.env.BIGCOMMERCE_ACCESS_TOKEN;

  if (!token || process.env.BIGCOMMERCE_STORE_HASH !== storeHash)
    throw testProviderDenied('Test provider configuration is unavailable.');

  try {
    const response = await fetch(
      `https://api.bigcommerce.com/stores/${encodeURIComponent(storeHash)}/v2/payments/methods`,
      {
        method: 'GET',
        headers: { 'X-Auth-Token': token, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) throw testProviderDenied();

    const methods = z
      .array(z.object({ code: z.string(), test_mode: z.boolean() }))
      .parse(await response.json());
    const matches = methods.filter((method) => method.code === 'bigpaypay');

    return {
      testProvider: matches.length === 1 && matches[0]?.test_mode === true,
      check: methods.filter((method) => method.code === 'cheque').length === 1,
    };
  } catch {
    throw testProviderDenied('The Test payment provider could not be verified in test mode.');
  }
}

export async function assertTestProviderEnabled(storeHash: string) {
  if (!(await readTestPaymentMethods(storeHash)).testProvider)
    throw testProviderDenied('The Test payment provider could not be verified in test mode.');
}
