import { PricingFragment } from '~/client/fragments/pricing';
import { graphql } from '~/client/graphql';

export const ProductCardFragment = graphql(
  `
    fragment ProductCardFragment on Product {
      entityId
      name
      description
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
      ...PricingFragment
    }
  `,
  [PricingFragment],
);
