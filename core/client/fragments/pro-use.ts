import { graphql } from '~/client/graphql';

export const ProUseProductFragment = graphql(`
  fragment ProUseProductFragment on Product {
    proUseMetafields: metafields(namespace: "custom_product", keys: ["pro_use_only"], first: 1) {
      edges {
        node {
          value
        }
      }
    }
  }
`);
