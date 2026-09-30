'use server';

import { getLocale } from 'next-intl/server';

import { getSessionCustomerAccessToken } from '~/auth';
import { getChannelIdFromLocale } from '~/channels.config';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';

const CategoryOptionsQuery = graphql(`
  query CategoryOptionsQuery($rootEntityId: Int) {
    site {
      categoryTree(rootEntityId: $rootEntityId) {
        entityId
        name
        hasChildren
        children {
          entityId
          name
          hasChildren
        }
      }
    }
  }
`);

interface CategoryOption {
  id: string;
  label: string;
  value: string;
}

export async function searchCategories(query: string): Promise<CategoryOption[]> {
  const locale = await getLocale();
  const customerAccessToken = await getSessionCustomerAccessToken();
  const channelId = getChannelIdFromLocale(locale);

  async function loadBranch(rootEntityId?: number, parentLabel = ''): Promise<CategoryOption[]> {
    const { data } = await client.fetch({
      document: CategoryOptionsQuery,
      variables: { rootEntityId },
      customerAccessToken,
      channelId,
      fetchOptions: {
        headers: { 'Accept-Language': locale },
        ...(customerAccessToken ? { cache: 'no-store' } : { next: { revalidate } }),
      },
    });
    const tree = data.site.categoryTree;
    const categories =
      rootEntityId === undefined
        ? tree
        : (tree.find((category) => category.entityId === rootEntityId)?.children ?? []);

    const branches = await Promise.all(
      categories.map(async (category) => {
        const label = parentLabel ? `${parentLabel} / ${category.name}` : category.name;
        const value = category.entityId.toString();

        return [
          { id: value, label, value },
          ...(category.hasChildren ? await loadBranch(category.entityId, label) : []),
        ];
      }),
    );

    return branches.flat();
  }

  const options = await loadBranch();
  const search = query.trim().toLocaleLowerCase(locale);

  return options.filter((category) => category.label.toLocaleLowerCase(locale).includes(search));
}
