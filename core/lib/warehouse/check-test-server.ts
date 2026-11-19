import 'server-only';

import { Redis } from '@upstash/redis';

import { warehouseApi } from './api';
import {
  checkTestAuthorization,
  type CheckTestClaim,
  checkTestDenied,
  type CheckTestPolicy,
  claimCheckTestAttempt,
  readCheckTestPolicy,
  verifyCheckTestClaim,
} from './check-test';
import { getWarehouseConfiguration } from './config';
import { type SubmissionCheckout, type SubmissionSnapshot, submissionSnapshot } from './submission';
import { validateWarehouseCheckout } from './validation';

interface TestCheckout extends SubmissionCheckout {
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

function eligibleCheckout(checkout: TestCheckout, policy: CheckTestPolicy): boolean {
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
  policy: CheckTestPolicy,
  input: { cartId: string; revision: string; warehouseId: string },
) {
  return (
    policy.cartId === input.cartId &&
    policy.revision === input.revision &&
    policy.warehouseId === input.warehouseId
  );
}

// Called only after ordinary signed cart/revision/origin/stock validation succeeded.
export async function authorizeCheckTest(input: {
  token: string;
  origin: string;
  cartId: string;
  revision: string;
  warehouseId: string;
  submission?: SubmissionSnapshot;
  claim?: CheckTestClaim;
}) {
  const policy = readCheckTestPolicy(process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION);

  if (!policy) {
    if (input.claim) throw checkTestDenied();

    return {};
  }

  const configuration = getWarehouseConfiguration();

  if (
    configuration.mode !== 'staging' ||
    policy.storeHash !== configuration.storeHash ||
    policy.channelId !== configuration.channelId
  )
    throw checkTestDenied();

  if (!matchesScope(policy, input)) {
    if (input.claim) throw checkTestDenied();

    return {};
  }

  const checkout = await warehouseApi<TestCheckout>(
    `checkouts/${encodeURIComponent(input.cartId)}`,
  );

  if (!eligibleCheckout(checkout, policy)) {
    if (input.claim) throw checkTestDenied();

    return {};
  }

  const secret = process.env.WAREHOUSE_VALIDATION_SECRET ?? '';
  const authorization = checkTestAuthorization(policy, input.origin, secret);

  if (!input.claim) return { checkTestAuthorization: authorization };
  if (
    !input.submission ||
    JSON.stringify(submissionSnapshot(checkout)) !== JSON.stringify(input.submission)
  )
    throw checkTestDenied();
  verifyCheckTestClaim(policy, input.origin, secret, input.claim);
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
    throw checkTestDenied('Checkout changed during test authorization.');
  // Read current policy again: revocation/configuration changes must fail closed.
  if (
    JSON.stringify(readCheckTestPolicy(process.env.WAREHOUSE_CHECK_TEST_AUTHORIZATION)) !==
    JSON.stringify(policy)
  )
    throw checkTestDenied();

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

  await claimCheckTestAttempt(
    redis,
    process.env.WAREHOUSE_REDIS_NAMESPACE ?? '',
    policy,
    JSON.stringify({ submission: input.submission, methodId: input.claim.methodId }),
  );

  return { checkTestAuthorization: authorization, checkTestClaimed: true };
}
