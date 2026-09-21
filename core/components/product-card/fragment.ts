import { PricingFragment } from '~/client/fragments/pricing';
import { ProUseProductFragment } from '~/client/fragments/pro-use';
import { ProductAttributesFragment } from '~/client/fragments/product-attributes';
import { graphql } from '~/client/graphql';
import { ShowCrateProductCardFragment } from '~/components/product-card/show-crate-fragment';

export const ProductCardFragment = graphql(
  `
    fragment ProductCardFragment on Product {
      entityId
      name
      description
      listViewDescriptionMetafield: metafields(
        namespace: "custom_product"
        keys: ["list_view_description"]
        first: 1
      ) {
        edges {
          node {
            value
          }
        }
      }
      ...ProductAttributesFragment
      packingFields: customFields(names: ["packing", "Packing", "PACKING"], first: 1) {
        edges {
          node {
            value
          }
        }
      }
      defaultImage {
        altText
        url: urlTemplate(lossy: true)
      }
      path
      showCartAction
      minPurchaseQuantity
      maxPurchaseQuantity
      availabilityV2 {
        status
      }
      productOptions(first: 1) {
        edges {
          node {
            entityId
          }
        }
      }
      brand {
        name
        path
      }
      inventory {
        hasVariantInventory
        isInStock
        aggregated {
          availableToSell
          warningLevel
          availableForBackorder
          unlimitedBackorder
          availableOnHand
        }
      }
      reviewSummary {
        numberOfReviews
        averageRating
      }
      variants(first: 1) {
        edges {
          node {
            entityId
            sku
            inventory {
              byLocation {
                edges {
                  node {
                    locationEntityId
                    backorderMessage
                  }
                }
              }
            }
          }
        }
      }
      featuredPromotions {
        edges {
          node {
            entityId
            text
          }
        }
      }
      ...ProUseProductFragment
      ...ShowCrateProductCardFragment
      ...PricingFragment
    }
  `,
  [ProUseProductFragment, PricingFragment, ShowCrateProductCardFragment, ProductAttributesFragment],
);
