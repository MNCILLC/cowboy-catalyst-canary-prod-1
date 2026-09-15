import { removeEdgesAndNodes } from '@bigcommerce/catalyst-client';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { SearchParams } from 'nuqs/server';

import { Stream, Streamable } from '@/vibes/soul/lib/streamable';
import { FeaturedProductCarousel } from '@/vibes/soul/sections/featured-product-carousel';
import { IncludedItems } from '@/vibes/soul/sections/product-detail/included-items';
import { ProductVideos } from '@/vibes/soul/sections/product-detail/product-videos';
import { ShowAudience } from '@/vibes/soul/sections/product-detail/show-audience';
import { ShowComparison } from '@/vibes/soul/sections/product-detail/show-comparison';
import { ShowProductSpecifications } from '@/vibes/soul/sections/product-detail/show-product-specifications';
import { auth, getSessionCustomerAccessToken } from '~/auth';
import { WholesalePricingAlert } from '~/components/wholesale-pricing-alert';
import { rewriteWysiwygContentUrls } from '~/data-transformers/html-content-transformer';
import { hasZeroPrice, pricesTransformer } from '~/data-transformers/prices-transformer';
import { productCardTransformer } from '~/data-transformers/product-card-transformer';
import { productOptionsTransformer } from '~/data-transformers/product-options-transformer';
import { showComparisonTransformer } from '~/data-transformers/show-comparison-transformer';
import {
  isShowCrateProduct,
  showCrateProductTransformer,
} from '~/data-transformers/show-crate-product-transformer';
import { getPreferredCurrencyCode } from '~/lib/currency';
import { getMakeswiftPageMetadata } from '~/lib/makeswift';
import { ProductDetail } from '~/lib/makeswift/components/product-detail';
import { getRecaptchaSiteKey } from '~/lib/recaptcha';
import { getMetadataAlternates } from '~/lib/seo/canonical';
import { getStockDisplayData } from '~/lib/stock-display';

import { addToCart } from './_actions/add-to-cart';
import { getMoreProductImages } from './_actions/get-more-images';
import { submitReview } from './_actions/submit-review';
import { ProductAnalyticsProvider } from './_components/product-analytics-provider';
import { ProductSchema } from './_components/product-schema';
import { ProductViewed } from './_components/product-viewed';
import { Reviews } from './_components/reviews';
import { WishlistButton } from './_components/wishlist-button';
import { WishlistButtonForm } from './_components/wishlist-button/form';
import {
  getProduct,
  getProductPageMetadata,
  getProductPricingAndRelatedProducts,
  getStreamableInventorySettingsQuery,
  getStreamableProduct,
  getStreamableProductInventory,
  getStreamableProductVariantInventory,
} from './page-data';
import { getShowComparisonProducts } from './show-comparison-data';

interface Props {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;

  setRequestLocale(locale);

  const customerAccessToken = await getSessionCustomerAccessToken();

  const productId = Number(slug);

  const product = await getProductPageMetadata(productId, customerAccessToken);

  if (!product) {
    return notFound();
  }

  const makeswiftMetadata = await getMakeswiftPageMetadata({ path: product.path, locale });

  const { pageTitle, metaDescription, metaKeywords } = product.seo;
  const { url, altText: alt } = product.defaultImage || {};

  return {
    title: makeswiftMetadata?.title || pageTitle || product.name,
    description:
      makeswiftMetadata?.description ||
      metaDescription ||
      `${product.plainTextDescription.replaceAll(/\s+/g, ' ').trim().slice(0, 150)}...`,
    ...(metaKeywords && { keywords: metaKeywords.split(',') }),
    alternates: await getMetadataAlternates({ path: product.path, locale }),
    ...(url && { openGraph: { images: [{ url, alt }] } }),
  };
}

export default async function Product({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const options = await searchParams;

  const optionValueIds = Object.keys(options)
    .map((option) => ({
      optionEntityId: Number(option),
      valueEntityId: Number(options[option]),
    }))
    .filter(
      (option) => !Number.isNaN(option.optionEntityId) && !Number.isNaN(option.valueEntityId),
    );

  const customerAccessToken = await getSessionCustomerAccessToken();
  const detachedWishlistFormId = 'product-add-to-wishlist-form';

  setRequestLocale(locale);

  const t = await getTranslations('Product');
  const format = await getFormatter();
  const productCardT = await getTranslations('Components.ProductCard');

  const productId = Number(slug);

  const [{ product: baseProduct, settings, batfeMessage }, recaptchaSiteKey] = await Promise.all([
    getProduct(productId, customerAccessToken),
    getRecaptchaSiteKey(),
  ]);

  const reviewsEnabled = Boolean(settings?.reviews.enabled && !settings.display.showProductRating);
  const showRating = Boolean(settings?.reviews.enabled && settings.display.showProductRating);
  const taxDisplay = settings?.tax?.pdp;

  if (!baseProduct) {
    return notFound();
  }

  const currencyCode = await getPreferredCurrencyCode();
  const streamableShowComparison = Streamable.from(async () => {
    const result = await getShowComparisonProducts(
      process.env.SHOW_COMPARISON_CATEGORY_PATH?.trim() || '/july-4th',
      currencyCode,
      customerAccessToken,
    );

    return showComparisonTransformer(result.products, format, result.taxDisplay);
  });
  const visibilityVariables = {
    entityId: productId,
    optionValueIds,
    useDefaultOptionSelections: true,
    currencyCode,
  };
  const visibilityPricing = await getProductPricingAndRelatedProducts(
    visibilityVariables,
    customerAccessToken,
  );

  if (
    !visibilityPricing ||
    (!isShowCrateProduct(visibilityPricing) && hasZeroPrice(visibilityPricing))
  ) {
    return notFound();
  }

  const isShow = isShowCrateProduct(visibilityPricing);
  const includedItems = (removeEdgesAndNodes(baseProduct.includedItems).at(0)?.value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const intendedAudience = (removeEdgesAndNodes(baseProduct.intendedAudience).at(0)?.value ?? '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

  const streamableProduct = Streamable.from(async () => {
    const variables = {
      entityId: Number(productId),
      optionValueIds,
      useDefaultOptionSelections: true,
    };

    const product = await getStreamableProduct(variables, customerAccessToken);

    if (!product) {
      return notFound();
    }

    return product;
  });

  const streamableProductSku = Streamable.from(async () => (await streamableProduct).sku);

  const streamableProductInventory = Streamable.from(async () => {
    const variables = {
      entityId: Number(productId),
      optionValueIds,
      useDefaultOptionSelections: true,
    };

    const product = await getStreamableProductInventory(variables, customerAccessToken);

    if (!product) {
      return notFound();
    }

    return product;
  });

  const streamableProductVariantInventory = Streamable.from(async () => {
    const product = await streamableProductInventory;

    if (!product.inventory.hasVariantInventory) {
      return undefined;
    }

    const variables = {
      productId,
      sku: product.sku,
    };

    const variants = await getStreamableProductVariantInventory(variables, customerAccessToken);

    if (!variants) {
      return undefined;
    }

    return removeEdgesAndNodes(variants).find((v) => v.sku === product.sku);
  });

  const streamableProductPricingAndRelatedProducts = Streamable.from(async () => {
    const variables = {
      entityId: Number(productId),
      optionValueIds,
      useDefaultOptionSelections: true,
      currencyCode,
    };

    return await getProductPricingAndRelatedProducts(variables, customerAccessToken);
  });

  const streamablePrices = Streamable.from(async () => {
    const product = await streamableProductPricingAndRelatedProducts;

    if (!product) {
      return null;
    }

    return pricesTransformer(product, format, taxDisplay) ?? null;
  });

  const streamableImages = Streamable.from(async () => {
    const product = await streamableProduct;

    const images = removeEdgesAndNodes(product.images)
      .filter((image) => image.url !== product.defaultImage?.url)
      .map((image) => ({
        src: image.url,
        alt: image.altText,
      }));

    return {
      images: product.defaultImage
        ? [{ src: product.defaultImage.url, alt: product.defaultImage.altText }, ...images]
        : images,
      pageInfo: product.images.pageInfo,
    };
  });

  // Product videos render in their own section below the primary content, so
  // they're streamed independently of the gallery images. The Storefront
  // GraphQL API returns each video as { title, url } (a YouTube watch URL).
  const streamableVideos = Streamable.from(async () => {
    const product = await streamableProduct;

    return removeEdgesAndNodes(product.videos).map((video) => ({
      url: video.url,
      title: video.title,
    }));
  });

  const streameableCtaLabel = Streamable.from(async () => {
    const product = await streamableProductInventory;

    if (product.availabilityV2.status === 'Unavailable') {
      return t('ProductDetails.Submit.unavailable');
    }

    if (product.availabilityV2.status === 'Preorder') {
      return t('ProductDetails.Submit.preorder');
    }

    if (!product.inventory.isInStock) {
      return t('ProductDetails.Submit.outOfStock');
    }

    return t('ProductDetails.Submit.addToCart');
  });

  const streameableCtaDisabled = Streamable.from(async () => {
    const product = await streamableProductInventory;

    if (product.availabilityV2.status === 'Unavailable') {
      return true;
    }

    if (product.availabilityV2.status === 'Preorder') {
      return false;
    }

    if (!product.inventory.isInStock) {
      return true;
    }

    return false;
  });

  const streamableInventorySettings = Streamable.from(async () => {
    return await getStreamableInventorySettingsQuery(customerAccessToken);
  });

  const streamableStockDisplayData = Streamable.from(async () => {
    const [product, variant, inventorySetting] = await Streamable.all([
      streamableProductInventory,
      streamableProductVariantInventory,
      streamableInventorySettings,
    ]);

    return getStockDisplayData(
      product.inventory.hasVariantInventory ? variant?.inventory : product.inventory,
      inventorySetting,
      (quantity) => t('ProductDetails.currentStock', { quantity }),
    );
  });

  const streamableBackorderDisplayData = Streamable.from(async () => {
    const [product, variant, inventorySetting] = await Streamable.all([
      streamableProductInventory,
      streamableProductVariantInventory,
      streamableInventorySettings,
    ]);

    let inventory;

    if (!product.inventory.hasVariantInventory) {
      inventory = product.inventory;
    } else {
      inventory = variant?.inventory;
    }

    if (!inventory?.aggregated || !inventorySetting) {
      return {
        availableOnHand: 0,
        availableForBackorder: 0,
        unlimitedBackorder: false,
        showQuantityOnBackorder: false,
        backorderMessage: null,
      };
    }

    const inventoryData = {
      availableOnHand: inventory.aggregated.availableOnHand,
      availableForBackorder: inventory.aggregated.availableForBackorder ?? 0,
      unlimitedBackorder: inventory.aggregated.unlimitedBackorder,
    };

    const { showQuantityOnBackorder, showBackorderMessage } = inventorySetting;

    const hasBackorderAvailablity =
      inventoryData.availableForBackorder > 0 || inventoryData.unlimitedBackorder;

    if (!hasBackorderAvailablity || !showBackorderMessage) {
      return {
        ...inventoryData,
        showQuantityOnBackorder: showQuantityOnBackorder && hasBackorderAvailablity,
        backorderMessage: null,
      };
    }

    let variantLocations;

    if (product.inventory.hasVariantInventory) {
      variantLocations = variant?.inventory?.byLocation;
    } else {
      const variants = removeEdgesAndNodes(product.variants);
      const baseVariant = variants.find((v) => v.sku === product.sku);

      variantLocations = baseVariant?.inventory?.byLocation;
    }

    if (!variantLocations) {
      return {
        ...inventoryData,
        showQuantityOnBackorder,
        backorderMessage: null,
      };
    }

    const inventoryByLocation = removeEdgesAndNodes(variantLocations).at(0);

    return {
      ...inventoryData,
      showQuantityOnBackorder,
      backorderMessage: inventoryByLocation?.backorderMessage || null,
    };
  });

  const streamableSpecifications = Streamable.from(async () => {
    const product = await streamableProduct;

    const customFields = removeEdgesAndNodes(product.customFields);
    const weightValue = product.weight?.value;
    const hasWeight =
      weightValue != null && String(weightValue).trim() !== '' && Number(weightValue) !== 0;

    return [
      {
        name: t('ProductDetails.Accordions.sku'),
        value: product.sku,
      },
      ...(hasWeight
        ? [
            {
              name: t('ProductDetails.Accordions.weight'),
              value: `${weightValue} ${product.weight?.unit}`,
            },
          ]
        : []),
      ...customFields.map((field) => ({
        name: `${field.name.charAt(0).toLocaleUpperCase(locale)}${field.name.slice(1)}`,
        value: field.value,
      })),
    ];
  });

  const streameableAccordions = Streamable.from(async () => {
    const [product, specifications] = await Streamable.all([
      streamableProduct,
      streamableSpecifications,
    ]);

    return [
      ...(!isShow && specifications.length
        ? [
            {
              title: t('ProductDetails.Accordions.specifications'),
              content: (
                <div className="prose @container">
                  <dl className="flex flex-col gap-4">
                    {specifications.map((field, index) => (
                      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2" key={index}>
                        <dt>
                          <strong>{field.name}</strong>
                        </dt>
                        <dd>{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ),
            },
          ]
        : []),
      ...(product.warranty
        ? [
            {
              title: t('ProductDetails.Accordions.warranty'),
              content: (
                <div
                  className="prose"
                  dangerouslySetInnerHTML={{
                    __html: rewriteWysiwygContentUrls(product.warranty),
                  }}
                />
              ),
            },
          ]
        : []),
    ];
  });

  const streameableRelatedProducts = Streamable.from(async () => {
    const product = await streamableProductPricingAndRelatedProducts;

    if (!product) {
      return [];
    }

    const relatedProducts = removeEdgesAndNodes(product.relatedProducts);

    return productCardTransformer(relatedProducts, format, undefined, undefined, taxDisplay);
  });

  const streamableMinQuantity = Streamable.from(async () => {
    const product = await streamableProduct;

    return product.minPurchaseQuantity;
  });

  const streamableMaxQuantity = Streamable.from(async () => {
    const product = await streamableProduct;

    return product.maxPurchaseQuantity;
  });

  const streamableAnalyticsData = Streamable.from(async () => {
    const [extendedProduct, pricingProduct] = await Streamable.all([
      streamableProduct,
      streamableProductPricingAndRelatedProducts,
    ]);

    return {
      id: extendedProduct.entityId,
      name: extendedProduct.name,
      sku: extendedProduct.sku,
      brand: extendedProduct.brand?.name ?? '',
      price: pricingProduct?.pricesIncludingTax?.price.value ?? 0,
      currency: pricingProduct?.pricesIncludingTax?.price.currencyCode ?? '',
    };
  });

  const promotionCallouts = removeEdgesAndNodes(baseProduct.featuredPromotions).map((p) => ({
    id: p.entityId.toString(),
    text: p.text,
  }));

  const streamableUser = Streamable.from(async () => {
    const session = await auth();
    const firstName = session?.user?.firstName ?? '';
    const lastName = session?.user?.lastName ?? '';

    if (!firstName || !lastName) {
      return { email: session?.user?.email ?? '', name: '' };
    }

    const lastInitial = lastName.charAt(0).toUpperCase();
    const obfuscatedName = `${firstName} ${lastInitial}.`;

    return { email: session?.user?.email ?? '', name: obfuscatedName };
  });

  return (
    <>
      <ProductAnalyticsProvider data={streamableAnalyticsData}>
        <ProductDetail
          action={addToCart}
          additionalActions={
            <WishlistButton
              formId={detachedWishlistFormId}
              productId={productId}
              productSku={streamableProductSku}
            />
          }
          additionalInformationTitle={t('ProductDetails.additionalInformation')}
          ctaDisabled={streameableCtaDisabled}
          ctaLabel={streameableCtaLabel}
          decrementLabel={t('ProductDetails.decreaseQuantity')}
          emptySelectPlaceholder={t('ProductDetails.emptySelectPlaceholder')}
          fields={productOptionsTransformer(baseProduct.productOptions)}
          galleryContent={
            isShow ? (
              <ShowProductSpecifications
                specifications={showCrateProductTransformer(visibilityPricing).showFeatures ?? []}
                textSize="base"
                title={t('ProductDetails.Accordions.specifications')}
              />
            ) : undefined
          }
          incrementLabel={t('ProductDetails.increaseQuantity')}
          loadMoreImagesAction={getMoreProductImages}
          prefetch={true}
          product={{
            id: baseProduct.entityId.toString(),
            title: baseProduct.name,
            description: (
              <div
                dangerouslySetInnerHTML={{
                  __html: rewriteWysiwygContentUrls(baseProduct.description),
                }}
              />
            ),
            href: baseProduct.path,
            images: streamableImages,
            price: streamablePrices,
            reviewsEnabled,
            showRating,
            numberOfReviews: baseProduct.reviewSummary.numberOfReviews,
            subtitle: baseProduct.brand?.name,
            rating: baseProduct.reviewSummary.averageRating,
            accordions: streameableAccordions,
            minQuantity: streamableMinQuantity,
            maxQuantity: streamableMaxQuantity,
            stockDisplayData: streamableStockDisplayData,
            backorderDisplayData: streamableBackorderDisplayData,
          }}
          productId={baseProduct.entityId}
          promotionCallouts={promotionCallouts}
          quantityLabel={t('ProductDetails.quantity')}
          recaptchaSiteKey={recaptchaSiteKey}
          reviewFormAction={submitReview}
          thumbnailLabel={t('ProductDetails.thumbnail')}
          user={streamableUser}
          wholesalePricingAlert={
            <WholesalePricingAlert
              className="-mt-2 mb-3"
              isAuthenticated={customerAccessToken != null}
              redirectTo={baseProduct.path}
            />
          }
        />
      </ProductAnalyticsProvider>

      <Stream fallback={null} value={streamableVideos}>
        {(videos) =>
          videos.length > 0 && (
            <ProductVideos
              title={isShow ? t('ProductDetails.showVideosTitle') : undefined}
              videos={videos}
            />
          )
        }
      </Stream>

      {isShow && (
        <>
          <IncludedItems items={includedItems} title={t('ProductDetails.includedItemsTitle')} />
          <ShowAudience
            items={intendedAudience}
            message={
              batfeMessage.trim() ? (
                <div
                  dangerouslySetInnerHTML={{ __html: rewriteWysiwygContentUrls(batfeMessage) }}
                />
              ) : undefined
            }
            title={t('ProductDetails.intendedAudienceTitle')}
          />
          <Stream fallback={null} value={streamableShowComparison}>
            {(data) => (
              <ShowComparison
                data={data}
                featureLabel={t('ProductDetails.Comparison.feature')}
                priceLabel={t('ProductDetails.Comparison.price')}
                title={t('ProductDetails.Comparison.title')}
                unavailablePriceLabel={productCardT('callForPricing')}
              />
            )}
          </Stream>
        </>
      )}

      {!isShow && (
        <FeaturedProductCarousel
          cta={{ label: t('RelatedProducts.cta'), href: '/shop-all' }}
          emptyStateSubtitle={t('RelatedProducts.browseCatalog')}
          emptyStateTitle={t('RelatedProducts.noRelatedProducts')}
          nextLabel={t('RelatedProducts.nextProducts')}
          previousLabel={t('RelatedProducts.previousProducts')}
          products={streameableRelatedProducts}
          scrollbarLabel={t('RelatedProducts.scrollbar')}
          title={t('RelatedProducts.title')}
        />
      )}

      {showRating && (
        <div id="reviews">
          <Reviews
            productId={productId}
            recaptchaSiteKey={recaptchaSiteKey}
            searchParams={searchParams}
            streamableImages={streamableImages}
            streamableProduct={streamableProduct}
          />
        </div>
      )}

      <Stream
        fallback={null}
        value={Streamable.from(async () =>
          Streamable.all([streamableProduct, streamableProductPricingAndRelatedProducts]),
        )}
      >
        {([extendedProduct, pricingProduct]) => (
          <>
            <ProductSchema
              product={{
                ...extendedProduct,
                pricesIncludingTax: pricingProduct?.pricesIncludingTax ?? null,
                pricesExcludingTax: pricingProduct?.pricesExcludingTax ?? null,
              }}
              taxDisplay={taxDisplay}
            />
            <ProductViewed
              product={{
                ...extendedProduct,
                pricesIncludingTax: pricingProduct?.pricesIncludingTax ?? null,
                pricesExcludingTax: pricingProduct?.pricesExcludingTax ?? null,
              }}
              taxDisplay={taxDisplay}
            />
          </>
        )}
      </Stream>

      <WishlistButtonForm
        formId={detachedWishlistFormId}
        productId={productId}
        productSku={streamableProductSku}
        searchParams={searchParams}
      />
    </>
  );
}
