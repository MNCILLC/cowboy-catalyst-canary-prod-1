import { graphql } from '~/client/graphql';

export const ShowCrateProductCardFragment = graphql(`
  fragment ShowCrateProductCardFragment on Product {
    entityId
    description
    cardImages: images(first: 50) {
      edges {
        node {
          altText
          url: urlTemplate(lossy: true)
        }
      }
    }
    showDescription: plainTextDescription(characterLimit: 240)
    showMetafields: metafields(
      namespace: "custom"
      keys: ["is_show", "product_card_custom_fields"]
      first: 2
    ) {
      edges {
        node {
          key
          value
        }
      }
    }
    showCustomFields: customFields(first: 50) {
      edges {
        node {
          entityId
          name
          value
        }
      }
    }
  }
`);
