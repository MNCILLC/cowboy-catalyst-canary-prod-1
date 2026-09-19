import { graphql } from '~/client/graphql';

export const ProductAttributesFragment = graphql(`
  fragment ProductAttributesFragment on Product {
    attributeMetafields: metafields(
      namespace: "custom_product"
      keys: [
        "colors"
        "effects"
        "firing_patterns"
        "caliber"
        "performance_height"
        "duration"
        "ignition_types"
      ]
      first: 7
    ) {
      edges {
        node {
          key
          value
        }
      }
    }
  }
`);
