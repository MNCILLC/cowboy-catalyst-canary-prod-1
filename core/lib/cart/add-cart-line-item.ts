import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql, VariablesOf } from '~/client/graphql';
import { assertProUseLineItems } from '~/lib/pro-use/server';
import { assertPricingAccess } from '~/lib/wholesale-pricing';

const AddCartLineItemMutation = graphql(`
  mutation AddCartLineItemMutation($input: AddCartLineItemsInput!) {
    cart {
      addCartLineItems(input: $input) {
        cart {
          entityId
        }
      }
    }
  }
`);

type Variables = VariablesOf<typeof AddCartLineItemMutation>;
export type AddCartLineItemsInput = Variables['input'];

export const addCartLineItem = async (
  cartEntityId: AddCartLineItemsInput['cartEntityId'],
  data: AddCartLineItemsInput['data'],
) => {
  await assertPricingAccess();
  await assertProUseLineItems(data.lineItems ?? []);

  const customerAccessToken = await getSessionCustomerAccessToken();

  return await client.fetch({
    document: AddCartLineItemMutation,
    variables: { input: { cartEntityId, data } },
    customerAccessToken,
    fetchOptions: { cache: 'no-store' },
  });
};
