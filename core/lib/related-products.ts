interface ProductReference {
  id: string;
}

interface CategoryPage<T> {
  products: T[];
  hasNextPage: boolean;
  endCursor?: string | null;
}

interface Options<T> {
  productId: string;
  relatedProducts: T[];
  getCategoryIds: () => Promise<number[]>;
  getCategoryPage: (categoryId: number, after?: string) => Promise<CategoryPage<T>>;
  limit?: number;
}

// Inputs have already passed the storefront's product visibility/price rules.
export async function resolveRelatedProducts<T extends ProductReference>({
  productId,
  relatedProducts,
  getCategoryIds,
  getCategoryPage,
  limit = 8,
}: Options<T>): Promise<T[]> {
  const selected = new Map<string, T>();
  const addProducts = (products: T[]) => {
    products.forEach((product) => {
      if (selected.size >= limit) return;
      if (product.id !== productId && !selected.has(product.id)) selected.set(product.id, product);
    });
  };

  addProducts(relatedProducts);

  // Do not mix category suggestions into a deliberately chosen related list.
  if (selected.size > 0) return [...selected.values()];

  const categoryIds = await getCategoryIds();

  // eslint-disable-next-line no-restricted-syntax -- Categories are visited sequentially in priority order, stopping as soon as the carousel is full.
  for (const categoryId of new Set(categoryIds)) {
    let after: string | undefined;
    const cursors = new Set<string>();

    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Each page depends on the preceding cursor and eligible results.
      const page = await getCategoryPage(categoryId, after);

      addProducts(page.products);
      if (selected.size >= limit) return [...selected.values()];
      if (!page.hasNextPage || !page.endCursor || cursors.has(page.endCursor)) break;
      cursors.add(page.endCursor);
      after = page.endCursor;
    }
  }

  return [...selected.values()];
}
