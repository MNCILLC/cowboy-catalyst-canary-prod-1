import {
  BigCommerceAPIError,
  BigCommerceAuthError,
  BigCommerceGQLError,
} from '@bigcommerce/catalyst-client';

import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql, VariablesOf } from '~/client/graphql';
import { getPreferredCurrencyCode } from '~/lib/currency';
import { assertProUseLineItems } from '~/lib/pro-use/server';
import {
  assertWarehouseItems,
  persistNewCartWarehouse,
  reserveNewCartWarehouse,
} from '~/lib/warehouse/server';
import { assertPricingAccess } from '~/lib/wholesale-pricing';

const CreateCartMutation = graphql(`
  mutation CreateCartMutation($createCartInput: CreateCartInput!) {
    cart {
      createCart(input: $createCartInput) {
        cart {
          entityId
        }
      }
    }
  }
`);

type Variables = VariablesOf<typeof CreateCartMutation>;
export type CreateCartInput = Variables['createCartInput'];

function createWasRejected(error: unknown) {
  if (error instanceof BigCommerceAPIError) return [400, 401, 403, 413, 422].includes(error.status);
  if (error instanceof BigCommerceAuthError) return true;

  return (
    error instanceof BigCommerceGQLError &&
    error.errors.length > 0 &&
    error.errors.every(({ message }) => message.startsWith('Not enough stock:'))
  );
}

export const createCart = async (data: CreateCartInput, displayedCart: string | null) => {
  await assertPricingAccess();
  await assertProUseLineItems(data.lineItems ?? []);

  const warehouse = await assertWarehouseItems(data.lineItems ?? [], undefined, { displayedCart });

  const customerAccessToken = await getSessionCustomerAccessToken();
  const currencyCode = await getPreferredCurrencyCode();

  const reservation = warehouse ? await reserveNewCartWarehouse(warehouse.id) : undefined;
  const response = await client
    .fetch({
      document: CreateCartMutation,
      variables: {
        createCartInput: {
          ...data,
          currencyCode,
        },
      },
      customerAccessToken,
      fetchOptions: { cache: 'no-store' },
    })
    .catch(async (error: unknown) => {
      // A timeout or internal error can arrive after BigCommerce created the cart.
      if (reservation && createWasRejected(error)) await reservation.release();

      throw error;
    });
  const cartId = response.data.cart.createCart?.cart?.entityId;

  if (reservation) {
    if (cartId) await reservation.complete(cartId);
    else await reservation.release();
  } else if (warehouse && cartId) {
    await persistNewCartWarehouse(cartId, warehouse.id);
  }

  return response;
};
