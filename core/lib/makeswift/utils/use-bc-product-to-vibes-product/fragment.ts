import { PricingFragment } from '~/client/fragments/pricing';
import { ProUseProductFragment } from '~/client/fragments/pro-use';
import { graphql } from '~/client/graphql';
import { ShowCrateProductCardFragment } from '~/components/product-card/show-crate-fragment';

export const MakeswiftProductFragment = graphql(
  `
    fragment MakeswiftProductFragment on Product {
      entityId
      name
      inventory {
        isInStock
      }
      defaultImage {
        altText
        url: urlTemplate(lossy: true)
      }
      path
      brand {
        name
        path
      }
      reviewSummary {
        numberOfReviews
        averageRating
      }
      ...ProUseProductFragment
      ...ShowCrateProductCardFragment
      ...PricingFragment
    }
  `,
  [ProUseProductFragment, PricingFragment, ShowCrateProductCardFragment],
);
