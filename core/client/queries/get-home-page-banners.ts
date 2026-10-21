import 'server-only';

import { cache } from 'react';

import { client } from '~/client';
import { graphql, ResultOf } from '~/client/graphql';

const HomePageBannersQuery = graphql(`
  query HomePageBannersQuery($after: String) {
    site {
      content {
        banners {
          homePage(first: 50, after: $after) {
            edges {
              node {
                entityId
                content
                location
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
  }
`);

type HomePageBanner = NonNullable<
  NonNullable<
    ResultOf<typeof HomePageBannersQuery>['site']['content']['banners']
  >['homePage']['edges']
>[number]['node'];

export const getHomePageBanners = cache(async (): Promise<HomePageBanner[]> => {
  try {
    const banners: HomePageBanner[] = [];
    let after: string | undefined;

    do {
      // Each page needs the cursor returned by the previous request.
      // eslint-disable-next-line no-await-in-loop
      const { data } = await client.fetch({
        document: HomePageBannersQuery,
        variables: { after },
        // Keep dashboard edits and scheduled visibility changes fresh.
        fetchOptions: { next: { revalidate: 60 } },
      });
      const page = data.site.content.banners?.homePage;

      banners.push(...(page?.edges?.map(({ node }) => node) ?? []));
      after = page?.pageInfo.hasNextPage ? (page.pageInfo.endCursor ?? undefined) : undefined;
    } while (after);

    return banners;
  } catch {
    // Optional banners must not prevent the storefront from loading.
    // eslint-disable-next-line no-console
    console.error('Unable to load home page banners.');

    return [];
  }
});
