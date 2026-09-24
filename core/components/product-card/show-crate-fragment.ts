import { graphql } from '~/client/graphql';

export const ShowCrateProductCardFragment = graphql(`
  fragment ShowCrateProductCardFragment on Product {
    entityId
    description
    cardStyleCategories: categories(first: 50) {
      edges {
        node {
          entityId
          cardStyleMetafields: metafields(
            namespace: "custom_category"
            keys: [
              "card_header_bg_color"
              "card_header_text_color"
              "card_footer_bg_color"
              "card_footer_text_color"
              "card_footer_button_bg_color"
              "card_footer_button_text_color"
              "card_body_bg_color_top"
              "card_body_bg_color_bottom"
              "card_body_text_color"
            ]
            first: 9
          ) {
            edges {
              node {
                key
                value
              }
            }
          }
        }
      }
    }
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
