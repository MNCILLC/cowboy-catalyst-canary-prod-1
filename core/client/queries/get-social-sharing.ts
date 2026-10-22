import 'server-only';

import { cache } from 'react';

import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { parseSharingServices } from '~/lib/social-sharing';

const SocialSharingQuery = graphql(`
  query SocialSharingQuery {
    store {
      metafields(namespace: "custom_site", keys: ["social_sharing"], first: 1) {
        edges {
          node {
            value
          }
        }
      }
    }
  }
`);

export const getSocialSharingServices = cache(async () => {
  try {
    const { data } = await client.fetch({
      document: SocialSharingQuery,
      fetchOptions: { next: { revalidate: 60 } },
    });

    return parseSharingServices(data.store.metafields.edges?.[0]?.node.value);
  } catch {
    // Optional sharing controls must not prevent a product or article from loading.
    // eslint-disable-next-line no-console
    console.error('Unable to load social sharing settings.');

    return [];
  }
});
