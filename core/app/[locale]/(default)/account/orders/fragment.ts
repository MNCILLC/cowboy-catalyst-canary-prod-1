import { ProUseProductFragment } from '~/client/fragments/pro-use';
import { graphql } from '~/client/graphql';

export const OrderItemFragment = graphql(
  `
    fragment OrderItemFragment on OrderPhysicalLineItem {
      entityId
      productEntityId
      brand
      name
      quantity
      baseCatalogProduct {
        path
        ...ProUseProductFragment
      }
      image {
        url: urlTemplate(lossy: true)
        altText
      }
      subTotalListPrice {
        value
        currencyCode
      }
      catalogProductWithOptionSelections {
        prices {
          price {
            value
            currencyCode
          }
        }
      }
      productOptions {
        __typename
        name
        value
      }
    }
  `,
  [ProUseProductFragment],
);

export const OrderGiftCertificateItemFragment = graphql(`
  fragment OrderGiftCertificateItemFragment on OrderGiftCertificateLineItem {
    entityId
    name
    salePrice {
      value
      formattedV2
      currencyCode
    }
  }
`);
