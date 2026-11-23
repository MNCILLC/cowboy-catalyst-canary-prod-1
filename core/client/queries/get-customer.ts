import { getSessionCustomerAccessToken } from '~/auth';
import { client } from '~/client';
import { graphql, ResultOf } from '~/client/graphql';

const ShopperIdentity = graphql(`
  query WarehouseShopperIdentity {
    customer {
      entityId
    }
  }
`);

export async function getSignedInWarehouseCustomerId() {
  const customerAccessToken = await getSessionCustomerAccessToken();

  if (!customerAccessToken) return undefined;

  const { data } = await client.fetch({
    document: ShopperIdentity,
    customerAccessToken,
    fetchOptions: { cache: 'no-store' },
  });

  if (!data.customer) throw new Error('Unable to verify the signed-in shopper.');

  return data.customer.entityId;
}

export const GetCustomerGroup = graphql(`
  query CustomerGroup {
    customer {
      customerGroupId
    }
  }
`);

export type GetCustomerGroupResponse = ResultOf<typeof GetCustomerGroup>;

export async function getCustomerGroupId() {
  const customerAccessToken = await getSessionCustomerAccessToken();

  const { data, errors } = await client.fetch({
    document: GetCustomerGroup,
    customerAccessToken,
  });

  if (errors) {
    throw new Error(errors.map((error) => error.message).join(', '));
  }

  return { data };
}
