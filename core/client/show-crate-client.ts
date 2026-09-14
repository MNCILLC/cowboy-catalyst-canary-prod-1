import { TadaDocumentNode } from 'gql.tada';
import { z } from 'zod';

import { client } from '~/client';
import { graphql } from '~/client/graphql';

const CustomFieldsPageQuery = graphql(`
  query ShowCrateCustomFieldsPage($entityId: Int!, $after: String!) {
    site {
      product(entityId: $entityId) {
        showCustomFields: customFields(first: 50, after: $after) {
          edges {
            node {
              entityId
              name
              value
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`);

const ShowProductSchema = z.object({
  entityId: z.number(),
  showMetafields: z.object({
    edges: z.array(z.object({ node: z.object({ key: z.string(), value: z.string() }) })).nullable(),
  }),
  showCustomFields: z.object({
    edges: z
      .array(
        z.object({ node: z.object({ entityId: z.number(), name: z.string(), value: z.string() }) }),
      )
      .nullable(),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
  }),
});

type ShowProduct = z.infer<typeof ShowProductSchema>;

function isShowProduct(value: unknown): value is ShowProduct {
  return (
    value !== null &&
    typeof value === 'object' &&
    'showMetafields' in value &&
    ShowProductSchema.safeParse(value).success
  );
}

// Only product-card queries use this adapter. Follow returned cursors for show products while
// preserving the original request's customer, channel, locale, and cache configuration.
type RequestOptions<TResult, TVariables> = Omit<
  Parameters<typeof client.fetch>[0],
  'document' | 'variables'
> & {
  document: TadaDocumentNode<TResult, TVariables>;
  variables: TVariables;
};

const fetch = async <TResult, TVariables extends Record<string, unknown>>(
  options: RequestOptions<TResult, TVariables>,
) => {
  const response = await client.fetch(options);
  const pending = new Map<number, Promise<ShowProduct['showCustomFields']>>();

  const completeFields = async (product: ShowProduct) => {
    let connection = product.showCustomFields;

    while (connection.pageInfo.hasNextPage) {
      const after = connection.pageInfo.endCursor;

      if (!after) throw new Error('Missing cursor for show product custom fields');

      // Each page needs the cursor returned by the previous request.
      // eslint-disable-next-line no-await-in-loop
      const page = await client.fetch({
        ...options,
        document: CustomFieldsPageQuery,
        variables: { entityId: product.entityId, after },
      });
      const next = page.data.site.product?.showCustomFields;

      if (!next || next.pageInfo.endCursor === after) {
        throw new Error('Unable to retrieve remaining show product custom fields');
      }

      connection = {
        edges: [...(connection.edges ?? []), ...(next.edges ?? [])],
        pageInfo: next.pageInfo,
      };
    }

    return connection;
  };

  const visit = async (value: unknown): Promise<void> => {
    if (isShowProduct(value)) {
      const isShow = value.showMetafields.edges?.some(
        ({ node }) => node.key === 'is_show' && node.value.trim().toLowerCase() === 'true',
      );

      if (isShow && value.showCustomFields.pageInfo.hasNextPage) {
        const fields = pending.get(value.entityId) ?? completeFields(value);

        pending.set(value.entityId, fields);
        value.showCustomFields = await fields;
      }
    }

    if (Array.isArray(value)) {
      await Promise.all(value.map(visit));
    } else if (value !== null && typeof value === 'object') {
      await Promise.all(Object.values(value).map(visit));
    }
  };

  await visit(response.data);

  return response;
};

export const showCrateClient = { fetch };
