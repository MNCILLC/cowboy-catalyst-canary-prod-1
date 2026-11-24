import 'server-only';

import { Redis } from '@upstash/redis';

import { warehouseApi } from './api';
import type { CheckTestClaim } from './check-test';
import { getWarehouseConfiguration } from './config';
import type { Warehouse } from './policy';
import { submissionReady, submissionSnapshot } from './submission';
import {
  claimTestProviderAttempt,
  type TestProviderClaim,
  testProviderDenied,
} from './test-provider';
import { readTestPaymentMethods } from './test-provider-method';
import {
  normalCheckAuthorization,
  normalTestProviderAuthorization,
  type NormalTestProviderPolicy,
  readNormalTestProviderPolicy,
  testProviderHash,
  verifyNormalTestProviderClaim,
} from './test-provider-normal';
import type { TestCheckout, TestProviderInput } from './test-provider-server';
import { validateWarehouseCheckout } from './validation';

type SubmissionScope = Omit<TestProviderInput, 'claim' | 'checkClaim'>;
type PaymentAttempt =
  | { checkTest: CheckTestClaim; testProvider?: never }
  | { testProvider: TestProviderClaim; checkTest?: never };

function normalCheckoutEligible(
  checkout: TestCheckout,
  policy: NormalTestProviderPolicy,
  input: SubmissionScope,
  warehouse: Warehouse,
) {
  const items = checkout.cart.line_items;

  if (
    checkout.id !== input.cartId ||
    checkout.order_id ||
    checkout.cart.channel_id !== policy.channelId ||
    !Number.isSafeInteger(checkout.cart.customer_id) ||
    checkout.cart.customer_id < 0 ||
    !policy.currencies.includes(checkout.cart.currency.code) ||
    !Number.isFinite(checkout.grand_total) ||
    checkout.grand_total <= 0 ||
    items.physical_items.some(
      (item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1,
    ) ||
    items.digital_items?.length ||
    items.custom_items?.length ||
    items.gift_certificates?.length
  )
    return false;

  return submissionReady(warehouse, checkout);
}

function normalWarehouse(
  policy: NormalTestProviderPolicy,
  input: SubmissionScope,
  configuration: ReturnType<typeof getWarehouseConfiguration>,
) {
  const warehouse = configuration.warehouses.find((entry) => entry.id === input.warehouseId);

  if (
    (configuration.mode !== 'staging' && configuration.mode !== 'development') ||
    (policy.allowLocalCheck && configuration.mode !== 'development') ||
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

async function enabledMethods(policy: NormalTestProviderPolicy, attempt?: PaymentAttempt) {
  const methods = await readTestPaymentMethods(policy.storeHash);
  const checkEnabled = policy.allowLocalCheck && methods.check;

  if (attempt?.checkTest && !checkEnabled) throw testProviderDenied('Check is unavailable.');
  if (!methods.testProvider && (attempt?.testProvider || !checkEnabled))
    throw testProviderDenied('The Test payment provider could not be verified in test mode.');

  return { card: methods.testProvider, check: checkEnabled };
}

function assertPolicyCurrent(
  policy: NormalTestProviderPolicy,
  configuration: ReturnType<typeof getWarehouseConfiguration>,
) {
  // Recheck policy and deployment scope after all async reads. Disabling or rotating revokes grants.
  if (
    JSON.stringify(readNormalTestProviderPolicy(process.env.WAREHOUSE_TEST_PROVIDER_POLICY)) !==
      JSON.stringify(policy) ||
    process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION ||
    process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION ||
    JSON.stringify(getWarehouseConfiguration()) !== JSON.stringify(configuration)
  )
    throw testProviderDenied();
}

async function recordAttempt(
  policy: NormalTestProviderPolicy,
  cartId: string,
  fingerprint: string,
) {
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
      cartId,
    },
    fingerprint,
  );
}

// The route authenticates the cart capability and checks recovery before entering here.
// Offers never consume a claim. Native SDK submission remains outside this backend.
export async function authorizeNormalTestProvider(
  input: SubmissionScope,
  attempt?: PaymentAttempt,
) {
  const policy = readNormalTestProviderPolicy(process.env.WAREHOUSE_TEST_PROVIDER_POLICY);

  if (!policy) {
    if (attempt) throw testProviderDenied();

    return {};
  }

  // Never silently combine the normal policy with a one-cart rehearsal policy.
  if (
    (attempt?.checkTest && !policy.allowLocalCheck) ||
    process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION ||
    process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION
  )
    throw testProviderDenied();

  const configuration = getWarehouseConfiguration();
  const warehouse = normalWarehouse(policy, input, configuration);

  const checkout = await warehouseApi<TestCheckout>(
    `checkouts/${encodeURIComponent(input.cartId)}`,
  );

  if (!normalCheckoutEligible(checkout, policy, input, warehouse)) {
    if (attempt) throw testProviderDenied();

    return {};
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
  const verifyClaim = (choice: PaymentAttempt) =>
    choice.checkTest
      ? normalCheckAuthorization(policy, binding, secret(), choice.checkTest)
      : verifyNormalTestProviderClaim(policy, binding, secret(), choice.testProvider);

  if (attempt) {
    if (!input.submission || JSON.stringify(input.submission) !== JSON.stringify(snapshot))
      throw testProviderDenied();
    verifyClaim(attempt);
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

  const methods = await enabledMethods(policy, attempt);

  assertPolicyCurrent(policy, configuration);

  if (!attempt)
    return {
      ...(methods.card && {
        testProviderAuthorization: normalTestProviderAuthorization(policy, binding, secret()),
      }),
      ...(methods.check && {
        checkTestAuthorization: normalCheckAuthorization(policy, binding, secret()),
      }),
    };

  const authorization = verifyClaim(attempt);

  await recordAttempt(
    policy,
    input.cartId,
    JSON.stringify({ submission: snapshot, methodId: authorization.methodId }),
  );

  return authorization.methodId === 'cheque'
    ? { checkTestAuthorization: authorization, checkTestClaimed: true }
    : { testProviderAuthorization: authorization, testProviderClaimed: true };
}
