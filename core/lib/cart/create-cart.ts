import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql, VariablesOf } from '~/client/graphql';
import { getPreferredCurrencyCode } from '~/lib/currency';
import { assertProUseLineItems } from '~/lib/pro-use/server';
import { assertWarehouseItems } from '~/lib/warehouse/server';
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

export const createCart = async (data: CreateCartInput) => {
  await assertPricingAccess();
  await assertProUseLineItems(data.lineItems ?? []);
  await assertWarehouseItems(data.lineItems ?? []);

  const customerAccessToken = await getSessionCustomerAccessToken();
  const currencyCode = await getPreferredCurrencyCode();

  return await client.fetch({
    document: CreateCartMutation,
    variables: {
      createCartInput: {
        ...data,
        currencyCode,
      },
    },
    customerAccessToken,
    fetchOptions: { cache: 'no-store' },
  });
};
