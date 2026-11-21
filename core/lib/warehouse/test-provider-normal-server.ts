import 'server-only';

import { Redis } from '@upstash/redis';

import { warehouseApi } from './api';
import { getWarehouseConfiguration } from './config';
import type { Warehouse } from './policy';
import { submissionReady, submissionSnapshot } from './submission';
import { claimTestProviderAttempt, testProviderDenied } from './test-provider';
import { assertTestProviderEnabled } from './test-provider-method';
import {
  normalTestProviderAuthorization,
  type NormalTestProviderPolicy,
  readNormalTestProviderPolicy,
  testProviderHash,
  verifyNormalTestProviderClaim,
} from './test-provider-normal';
import type { TestCheckout, TestProviderInput } from './test-provider-server';
import { validateWarehouseCheckout } from './validation';

function normalCheckoutIneligibility(
  checkout: TestCheckout,
  policy: NormalTestProviderPolicy,
  input: TestProviderInput,
  warehouse: Warehouse,
) {
  const items = checkout.cart.line_items;
  const snapshot = submissionSnapshot(checkout);
  const quantity = snapshot.items.reduce((sum, item) => sum + item.quantity, 0);

  if (
    checkout.id !== input.cartId ||
    checkout.order_id ||
    checkout.cart.channel_id !== policy.channelId ||
    !Number.isSafeInteger(checkout.cart.customer_id) ||
    checkout.cart.customer_id < 0 ||
    !policy.currencies.includes(checkout.cart.currency.code) ||
    !Number.isFinite(snapshot.grandTotal) ||
    snapshot.grandTotal <= 0 ||
    snapshot.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1) ||
    items.digital_items?.length ||
    items.custom_items?.length ||
    items.gift_certificates?.length
  )
    return 'INELIGIBLE';

  if (snapshot.items.length > policy.maxLineItems) return 'MAX_LINE_ITEMS_EXCEEDED';
  if (
    snapshot.grandTotal > policy.maxGrandTotal ||
    quantity > policy.maxQuantity ||
    !submissionReady(warehouse, checkout)
  )
    return 'INELIGIBLE';

  return undefined;
}

function normalWarehouse(
  policy: NormalTestProviderPolicy,
  input: TestProviderInput,
  configuration: ReturnType<typeof getWarehouseConfiguration>,
) {
  const warehouse = configuration.warehouses.find((entry) => entry.id === input.warehouseId);

  if (
    configuration.mode !== 'staging' ||
    policy.storeHash !== configuration.storeHash ||
    policy.channelId !== configuration.channelId ||
    !policy.origins.includes(input.origin) ||
    !configuration.checkoutOrigins.includes(input.origin) ||
    !policy.warehouseIds.includes(input.warehouseId) ||
    !warehouse
  )
    throw testProviderDenied();

  return warehouse;
}

// The route authenticates the cart capability and checks recovery before entering here.
// Offers never consume a claim. Native SDK submission remains outside this backend.
export async function authorizeNormalTestProvider(input: TestProviderInput) {
  const policy = readNormalTestProviderPolicy(process.env.WAREHOUSE_TEST_PROVIDER_POLICY);

  if (!policy) {
    if (input.claim) throw testProviderDenied();

    return {};
  }

  // Never silently combine the normal policy with a one-cart rehearsal policy.
  if (
    process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION ||
    process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION
  )
    throw testProviderDenied();

  const configuration = getWarehouseConfiguration();
  const warehouse = normalWarehouse(policy, input, configuration);

  const checkout = await warehouseApi<TestCheckout>(
    `checkouts/${encodeURIComponent(input.cartId)}`,
  );

  const reason = normalCheckoutIneligibility(checkout, policy, input, warehouse);

  if (reason) {
    if (input.claim) throw testProviderDenied();

    return reason === 'MAX_LINE_ITEMS_EXCEEDED'
      ? { testProviderIneligibility: { code: reason, maxLineItems: policy.maxLineItems } }
      : {};
  }

  const snapshot = submissionSnapshot(checkout);

  const binding = {
    origin: input.origin,
    cartId: input.cartId,
    revision: input.revision,
    warehouseId: input.warehouseId,
    customerId: checkout.cart.customer_id,
    currency: checkout.cart.currency.code,
    snapshotHash: testProviderHash(snapshot),
  };
  const secret = () => process.env.WAREHOUSE_VALIDATION_SECRET ?? '';
  const verifyClaim = () => {
    if (!input.claim) throw testProviderDenied();

    return verifyNormalTestProviderClaim(policy, binding, secret(), input.claim);
  };

  if (input.claim) {
    if (!input.submission || JSON.stringify(input.submission) !== JSON.stringify(snapshot))
      throw testProviderDenied();
    verifyClaim();
  }

  // Includes current warehouse revision, location stock and completed fulfillment.
  await validateWarehouseCheckout(
    input.token,
    input.origin,
    input.cartId,
    input.revision,
    undefined,
    snapshot,
  );

  const latest = await warehouseApi<TestCheckout>(`checkouts/${encodeURIComponent(input.cartId)}`);

  if (JSON.stringify(latest) !== JSON.stringify(checkout))
    throw testProviderDenied('Checkout changed during test authorization.');

  await assertTestProviderEnabled(policy.storeHash);
  // Recheck policy and deployment scope after all async reads. Disabling or rotating revokes grants.
  if (
    JSON.stringify(readNormalTestProviderPolicy(process.env.WAREHOUSE_TEST_PROVIDER_POLICY)) !==
      JSON.stringify(policy) ||
    process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION ||
    process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION ||
    JSON.stringify(getWarehouseConfiguration()) !== JSON.stringify(configuration)
  )
    throw testProviderDenied();

  if (!input.claim)
    return {
      testProviderAuthorization: normalTestProviderAuthorization(policy, binding, secret()),
    };

  const authorization = verifyClaim();
  const redis = new Redis({
    url: process.env.WAREHOUSE_REDIS_URL ?? '',
    token: process.env.WAREHOUSE_REDIS_TOKEN ?? '',
    retry: false,
    enableAutoPipelining: false,
    automaticDeserialization: false,
    enableTelemetry: false,
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });

  await claimTestProviderAttempt(
    redis,
    process.env.WAREHOUSE_REDIS_NAMESPACE ?? '',
    {
      id: policy.id,
      storeHash: policy.storeHash,
      channelId: policy.channelId,
      cartId: input.cartId,
    },
    JSON.stringify({ submission: snapshot, methodId: input.claim.methodId }),
  );

  return { testProviderAuthorization: authorization, testProviderClaimed: true };
}
