import 'server-only';

import { Redis } from '@upstash/redis';

import { warehouseApi } from './api';
import type { CheckTestClaim } from './check-test';
import { getWarehouseConfiguration } from './config';
import { type SubmissionCheckout, type SubmissionSnapshot, submissionSnapshot } from './submission';
import {
  claimTestProviderAttempt,
  readTestProviderPolicy,
  testProviderAuthorization,
  type TestProviderClaim,
  testProviderDenied,
  type TestProviderPolicy,
  verifyTestProviderClaim,
} from './test-provider';
import { assertTestProviderEnabled } from './test-provider-method';
import { authorizeNormalTestProvider } from './test-provider-normal-server';
import { validateWarehouseCheckout } from './validation';

export interface TestCheckout extends SubmissionCheckout {
  id: string;
  order_id: number | null;
  cart: SubmissionCheckout['cart'] & {
    customer_id: number;
    channel_id: number;
    currency: { code: string };
    line_items: SubmissionCheckout['cart']['line_items'] & {
      digital_items?: unknown[];
      custom_items?: unknown[];
      gift_certificates?: unknown[];
    };
  };
}

function eligibleCheckout(checkout: TestCheckout, policy: TestProviderPolicy): boolean {
  const items = checkout.cart.line_items;
  const item = items.physical_items[0];

  return !(
    checkout.id !== policy.cartId ||
    checkout.order_id ||
    checkout.cart.customer_id !== policy.customerId ||
    checkout.cart.channel_id !== policy.channelId ||
    checkout.cart.currency.code !== policy.currency ||
    checkout.grand_total !== policy.grandTotal ||
    items.physical_items.length !== 1 ||
    !item ||
    item.product_id !== policy.productId ||
    item.variant_id !== policy.variantId ||
    item.quantity !== policy.quantity ||
    items.digital_items?.length ||
    items.custom_items?.length ||
    items.gift_certificates?.length
  );
}

function matchesScope(
  policy: TestProviderPolicy,
  input: { cartId: string; revision: string; warehouseId: string },
) {
  return (
    policy.cartId === input.cartId &&
    policy.revision === input.revision &&
    policy.warehouseId === input.warehouseId
  );
}

export interface TestProviderInput {
  token: string;
  origin: string;
  cartId: string;
  revision: string;
  warehouseId: string;
  submission?: SubmissionSnapshot;
  claim?: TestProviderClaim;
  checkClaim?: CheckTestClaim;
}

export async function authorizeTestProvider(input: TestProviderInput) {
  if (process.env.WAREHOUSE_TEST_PROVIDER_POLICY !== undefined) {
    const { checkClaim, claim, ...scope } = input;

    if (checkClaim && claim) throw testProviderDenied();

    if (checkClaim) return authorizeNormalTestProvider(scope, { checkTest: checkClaim });

    return authorizeNormalTestProvider(scope, claim && { testProvider: claim });
  }

  if (input.checkClaim) throw testProviderDenied();

  return authorizeCartTestProvider(input);
}

async function authorizeCartTestProvider(input: TestProviderInput) {
  const policy = readTestProviderPolicy(process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION);

  if (!policy) {
    if (input.claim) throw testProviderDenied();

    return {};
  }

  const configuration = getWarehouseConfiguration();

  if (
    configuration.mode !== 'staging' ||
    policy.storeHash !== configuration.storeHash ||
    policy.channelId !== configuration.channelId
  )
    throw testProviderDenied();

  if (!matchesScope(policy, input)) {
    if (input.claim) throw testProviderDenied();

    return {};
  }

  const checkout = await warehouseApi<TestCheckout>(
    `checkouts/${encodeURIComponent(input.cartId)}`,
  );

  if (!eligibleCheckout(checkout, policy)) {
    if (input.claim) throw testProviderDenied();

    return {};
  }

  await assertTestProviderEnabled(policy.storeHash);

  const secret = process.env.WAREHOUSE_VALIDATION_SECRET ?? '';
  const authorization = testProviderAuthorization(policy, input.origin, secret);

  if (!input.claim) return { testProviderAuthorization: authorization };
  if (
    !input.submission ||
    JSON.stringify(submissionSnapshot(checkout)) !== JSON.stringify(input.submission)
  )
    throw testProviderDenied();
  verifyTestProviderClaim(policy, input.origin, secret, input.claim);
  // Revalidate the exact snapshot immediately before the atomic attempt claim.
  await validateWarehouseCheckout(
    input.token,
    input.origin,
    input.cartId,
    input.revision,
    undefined,
    input.submission,
  );

  const latest = await warehouseApi<TestCheckout>(`checkouts/${encodeURIComponent(input.cartId)}`);

  if (JSON.stringify(latest) !== JSON.stringify(checkout))
    throw testProviderDenied('Checkout changed during test authorization.');
  // Read current policy again: revocation/configuration changes must fail closed.
  assertCartPolicyCurrent(policy);

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

  // Recheck immediately before claiming; unknown/live/missing provider state fails closed.
  await assertTestProviderEnabled(policy.storeHash);
  assertCartPolicyCurrent(policy);

  await claimTestProviderAttempt(
    redis,
    process.env.WAREHOUSE_REDIS_NAMESPACE ?? '',
    policy,
    JSON.stringify({ submission: input.submission, methodId: input.claim.methodId }),
  );

  return { testProviderAuthorization: authorization, testProviderClaimed: true };
}

function assertCartPolicyCurrent(policy: TestProviderPolicy) {
  if (
    process.env.WAREHOUSE_TEST_PROVIDER_POLICY !== undefined ||
    JSON.stringify(readTestProviderPolicy(process.env.WAREHOUSE_TEST_PROVIDER_AUTHORIZATION)) !==
      JSON.stringify(policy)
  )
    throw testProviderDenied();
}
