import { Sliders } from 'lucide-react';
import { ReactNode, Suspense } from 'react';

import { Stream, Streamable } from '@/vibes/soul/lib/streamable';
import { Button } from '@/vibes/soul/primitives/button';
import { CompareAddToCartAction } from '@/vibes/soul/primitives/compare-card/add-to-cart-form';
import { CursorPagination, CursorPaginationInfo } from '@/vibes/soul/primitives/cursor-pagination';
import { Product } from '@/vibes/soul/primitives/product-card';
import * as SidePanel from '@/vibes/soul/primitives/side-panel';
import { Breadcrumb, Breadcrumbs, BreadcrumbsSkeleton } from '@/vibes/soul/sections/breadcrumbs';
import { ProductList } from '@/vibes/soul/sections/product-list';
import { ProductAttributesToggle } from '@/vibes/soul/sections/product-list/attribute-visibility';
import {
  ProductView,
  ProductViewProvider,
  ProductViewSwitcher,
} from '@/vibes/soul/sections/product-list/view';
import { AppliedFilters } from '@/vibes/soul/sections/products-list-section/applied-filters';
import { Filter, FiltersPanel } from '@/vibes/soul/sections/products-list-section/filters-panel';
import {
  Sorting,
  SortingSkeleton,
  Option as SortOption,
} from '@/vibes/soul/sections/products-list-section/sorting';

interface Props {
  defaultExpandedFilters?: boolean;
  showFilters?: boolean;
  showAppliedFilters?: boolean;
  showSort?: boolean;
  enableListView?: boolean;
  enableEnhancedProductAttributes?: boolean;
  initialView?: ProductView;
  addToCartAction?: CompareAddToCartAction;
  cartQuantities?: Streamable<Record<string, number>>;
  breadcrumbs?: Streamable<Breadcrumb[]>;
  title?: Streamable<string | null>;
  totalCount: Streamable<string>;
  products: Streamable<Product[]>;
  filters: Streamable<Filter[]>;
  sortOptions: Streamable<SortOption[]>;
  compareProducts?: Streamable<Product[]>;
  paginationInfo?: Streamable<CursorPaginationInfo>;
  compareHref?: string;
  compareLabel?: Streamable<string>;
  showCompare?: Streamable<boolean>;
  filterLabel?: string;
  filtersPanelTitle?: Streamable<string>;
  resetFiltersLabel?: Streamable<string>;
  showRating?: boolean;
  rangeFilterApplyLabel?: Streamable<string>;
  sortLabel?: Streamable<string | null>;
  sortPlaceholder?: Streamable<string | null>;
  sortParamName?: string;
  sortDefaultValue?: string;
  compareParamName?: string;
  emptyStateSubtitle?: Streamable<string>;
  emptyStateTitle?: Streamable<string>;
  placeholderCount?: number;
  removeLabel?: Streamable<string>;
  maxItems?: number;
  maxCompareLimitMessage?: Streamable<string>;
  productListBanner?: ReactNode;
}

export function ProductsListSection({
  defaultExpandedFilters = false,
  showFilters = true,
  showAppliedFilters = false,
  showSort = true,
  enableListView = true,
  enableEnhancedProductAttributes = false,
  initialView,
  addToCartAction,
  cartQuantities,
  breadcrumbs: streamableBreadcrumbs,
  title = 'Products',
  totalCount,
  products,
  showRating,
  compareProducts,
  sortOptions: streamableSortOptions,
  sortDefaultValue,
  filters,
  compareHref,
  compareLabel,
  showCompare,
  paginationInfo,
  filterLabel = 'Filters',
  filtersPanelTitle: streamableFiltersPanelTitle = 'Filters',
  resetFiltersLabel,
  rangeFilterApplyLabel,
  sortLabel: streamableSortLabel,
  sortPlaceholder: streamableSortPlaceholder,
  sortParamName,
  compareParamName,
  emptyStateSubtitle,
  emptyStateTitle,
  placeholderCount = 8,
  removeLabel,
  maxItems,
  maxCompareLimitMessage,
  productListBanner,
}: Props) {
  return (
    <ProductViewProvider enabled={enableListView} initialView={initialView}>
      <div className="group/products-list-section @container">
        <div className="mx-auto max-w-screen-2xl px-4 py-10 @xl:px-6 @xl:py-14 @4xl:px-8 @4xl:py-12">
          <div>
            <Stream fallback={<BreadcrumbsSkeleton />} value={streamableBreadcrumbs}>
              {(breadcrumbs) =>
                breadcrumbs && breadcrumbs.length > 1 && <Breadcrumbs breadcrumbs={breadcrumbs} />
              }
            </Stream>
            <div className="flex flex-wrap items-center justify-between gap-4 pb-8 pt-6 text-foreground">
              <div>
                <div>
                  <h1 className="flex items-center gap-2 font-heading text-3xl font-medium leading-none @lg:text-4xl @2xl:text-5xl">
                    <Suspense
                      fallback={
                        <span className="inline-flex h-[1lh] w-[6ch] animate-pulse rounded-lg bg-contrast-100" />
                      }
                    >
                      {title}
                    </Suspense>
                  </h1>
                </div>
                <div>
                  <Stream
                    fallback={
                      <span className="inline-flex h-[1lh] w-[2ch] animate-pulse rounded-lg bg-contrast-100" />
                    }
                    value={totalCount}
                  >
                    {(count) => (
                      <span className="text-lg text-contrast-300">
                        {count} {count === '1' ? 'Product' : 'Products'}
                      </span>
                    )}
                  </Stream>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {showSort && (
                    <div className="w-44 shrink-0">
                      <Stream
                        fallback={<SortingSkeleton />}
                        value={Streamable.all([
                          streamableSortLabel,
                          streamableSortOptions,
                          streamableSortPlaceholder,
                        ])}
                      >
                        {([label, options, placeholder]) => (
                          <Sorting
                            defaultValue={sortDefaultValue}
                            label={label}
                            options={options}
                            paramName={sortParamName}
                            placeholder={placeholder}
                          />
                        )}
                      </Stream>
                    </div>
                  )}
                  {enableEnhancedProductAttributes && <ProductAttributesToggle />}
                  <ProductViewSwitcher />
                </div>
                {showFilters && (
                  <div className="block @3xl:hidden">
                    <SidePanel.Root>
                      <SidePanel.Trigger asChild>
                        <Button size="medium" variant="secondary">
                          {filterLabel}
                          <span className="hidden @xl:block">
                            <Sliders size={20} />
                          </span>
                        </Button>
                      </SidePanel.Trigger>
                      <Stream value={streamableFiltersPanelTitle}>
                        {(filtersPanelTitle) => (
                          <SidePanel.Content title={filtersPanelTitle}>
                            <FiltersPanel
                              defaultExpanded={defaultExpandedFilters}
                              filters={filters}
                              paginationInfo={paginationInfo}
                              rangeFilterApplyLabel={rangeFilterApplyLabel}
                              resetFiltersLabel={resetFiltersLabel}
                            />
                          </SidePanel.Content>
                        )}
                      </Stream>
                    </SidePanel.Root>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-stretch gap-8 @4xl:gap-10">
            {showFilters && (
              <aside className="hidden w-52 @3xl:block @4xl:w-60">
                <Stream value={streamableFiltersPanelTitle}>
                  {(filtersPanelTitle) => <h2 className="sr-only">{filtersPanelTitle}</h2>}
                </Stream>
                <FiltersPanel
                  className="sticky top-4"
                  defaultExpanded={defaultExpandedFilters}
                  filters={filters}
                  paginationInfo={paginationInfo}
                  rangeFilterApplyLabel={rangeFilterApplyLabel}
                  resetFiltersLabel={resetFiltersLabel}
                />
              </aside>
            )}

            <div className="group-has-data-pending/products-list-section:animate-pulse min-w-0 flex-1">
              {productListBanner}
              {showAppliedFilters && (
                <AppliedFilters filters={filters} paginationInfo={paginationInfo} />
              )}
              <ProductList
                addToCartAction={addToCartAction}
                cartQuantities={cartQuantities}
                compareHref={compareHref}
                compareLabel={compareLabel}
                compareParamName={compareParamName}
                compareProducts={compareProducts}
                emptyStateSubtitle={emptyStateSubtitle}
                emptyStateTitle={emptyStateTitle}
                maxCompareLimitMessage={maxCompareLimitMessage}
                maxItems={maxItems}
                placeholderCount={placeholderCount}
                products={products}
                removeLabel={removeLabel}
                showCompare={showCompare}
                showRating={showRating}
              />

              {paginationInfo && <CursorPagination info={paginationInfo} />}
            </div>
          </div>
        </div>
      </div>
    </ProductViewProvider>
  );
}
