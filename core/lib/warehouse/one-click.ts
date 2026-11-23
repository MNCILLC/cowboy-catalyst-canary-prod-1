import 'server-only';

import { jwtVerify } from 'jose';
import { createHash, randomUUID } from 'node:crypto';

import { getSignedInWarehouseCustomerId } from '~/client/queries/get-customer';

import { WarehouseValidationError } from './authorization';
import { automaticInitializationEnabled, getWarehouseConfiguration } from './config';
import { getAtomicWarehousePersistence } from './persistence';
import { authorizeOwnedWarehouseCart } from './server';
import { createValidationAccess } from './validation';

function unavailable() {
  return new WarehouseValidationError(
    'Return to your cart and open Checkout again.',
    409,
    'STALE_HANDOFF',
  );
}

function settings() {
  const config = getWarehouseConfiguration();
  const clientId = process.env.WAREHOUSE_CURRENT_CUSTOMER_CLIENT_ID;
  const secret = process.env.WAREHOUSE_CURRENT_CUSTOMER_CLIENT_SECRET;

  if (
    !automaticInitializationEnabled() ||
    (config.mode !== 'development' && config.mode !== 'staging') ||
    !clientId ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(clientId) ||
    !secret
  )
    throw new WarehouseValidationError('Automatic checkout is unavailable.', 503, 'UNAVAILABLE');

  return { config, clientId, secret };
}

type CheckoutCart = Awaited<ReturnType<typeof authorizeOwnedWarehouseCart>>;

function binding({ cart, record, warehouse }: CheckoutCart, origin: string) {
  const items = [...cart.line_items.physical_items, ...cart.line_items.digital_items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((i) => [i.id, i.product_id, i.variant_id, i.quantity]);

  return createHash('sha256')
    .update(
      JSON.stringify([
        origin,
        cart.customer_id,
        record.storeHash,
        record.channelId,
        record.cartId,
        record.warehouseId,
        record.revision,
        warehouse.locationId,
        warehouse.pickupMethodId,
        warehouse.allowShipping,
        items,
      ]),
    )
    .digest('hex');
}

export async function beginCheckoutHandoff() {
  const { config } = settings();
  const customerId = await getSignedInWarehouseCustomerId();

  if (!customerId) throw unavailable();

  const scope = { storeHash: config.storeHash, channelId: config.channelId, customerId };
  const storage = await getAtomicWarehousePersistence();
  const id = randomUUID();

  await storage.initializationHandoff(scope, { type: 'begin', id });

  return async (state: CheckoutCart, destination: URL) => {
    if (
      state.cart.customer_id !== customerId ||
      state.record.storeHash !== scope.storeHash ||
      state.record.channelId !== scope.channelId ||
      !config.checkoutOrigins.includes(destination.origin) ||
      destination.hash ||
      !(await storage.initializationHandoff(scope, {
        type: 'publish',
        id,
        warehouseId: state.warehouse.id,
        binding: binding(state, destination.origin),
        context: JSON.stringify([state.cart.id, destination.origin]),
      }))
    )
      throw unavailable();

    // The fragment identifies the attempt. Customer proof travels only in a POST.
    destination.hash = new URLSearchParams({ warehouseHandoff: id }).toString();
  };
}

export async function exchangeCheckoutHandoff(
  jwt: string,
  cartId: string,
  id: string,
  origin: string,
) {
  const { config, clientId, secret } = settings();
  let customerId: number;

  try {
    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(secret), {
      algorithms: ['HS512'],
      issuer: 'bc/apps',
      audience: clientId,
      maxTokenAge: '15m',
      requiredClaims: ['iat', 'exp', 'store_hash', 'operation', 'customer'],
    });
    const customer = payload.customer;

    if (
      payload.store_hash !== config.storeHash ||
      payload.operation !== 'current_customer' ||
      !customer ||
      typeof customer !== 'object' ||
      !('id' in customer) ||
      typeof customer.id !== 'number' ||
      !Number.isSafeInteger(customer.id) ||
      customer.id < 1
    )
      throw unavailable();
    customerId = customer.id;
  } catch {
    throw new WarehouseValidationError(
      'Sign in and reopen Checkout from your cart.',
      401,
      'UNAUTHORIZED',
    );
  }

  const scope = { storeHash: config.storeHash, channelId: config.channelId, customerId };
  const storage = await getAtomicWarehousePersistence();

  if (
    !config.checkoutOrigins.includes(origin) ||
    !(await storage.initializationHandoff(scope, {
      type: 'pending',
      id,
      context: JSON.stringify([cartId, origin]),
    }))
  )
    throw unavailable();

  const state = await authorizeOwnedWarehouseCart(cartId, scope);

  if (
    !(await storage.initializationHandoff(scope, {
      type: 'consume',
      id,
      binding: binding(state, origin),
    }))
  )
    throw unavailable();

  return {
    version: 1,
    preview: true,
    cartId,
    warehouse: state.warehouse,
    validation: createValidationAccess(state.record, origin, config.validationOrigin),
  };
}
