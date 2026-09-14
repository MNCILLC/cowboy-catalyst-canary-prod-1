import { graphql } from '~/client/graphql';

export const ShowCrateProductCardFragment = graphql(`
  fragment ShowCrateProductCardFragment on Product {
    entityId
    showDescription: plainTextDescription(characterLimit: 240)
    showMetafields: metafields(namespace: "custom", keys: ["is_show"], first: 1) {
      edges {
        node {
          key
          value
        }
      }
    }
    showCustomFields: customFields(first: 50) {
      pageInfo {
        hasNextPage
        endCursor
      }
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
