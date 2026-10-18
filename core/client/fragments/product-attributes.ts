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
        "shot_count"
        "ignition_types"
      ]
      first: 8
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
