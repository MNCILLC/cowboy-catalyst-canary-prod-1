import 'server-only';

import { cache } from 'react';

import { client } from '~/client';
import { graphql } from '~/client/graphql';

const ContactSectionQuery = graphql(`
  query ContactSectionQuery {
    site {
      settings {
        contact {
          email
          phone
          address
        }
        reCaptcha {
          isEnabledOnStorefront
          siteKey
        }
      }
      content {
        pages(first: 1, filters: { pageType: CONTACT }) {
          edges {
            node {
              ... on ContactPage {
                entityId
              }
            }
          }
        }
      }
    }
  }
`);

export const getContactSectionData = cache(async () => {
  const { data } = await client.fetch({
    document: ContactSectionQuery,
    fetchOptions: { next: { revalidate: 60 } },
  });
  const page = data.site.content.pages.edges?.[0]?.node;
  const settings = data.site.settings;

  return {
    contact: settings?.contact ?? null,
    pageId: page && 'entityId' in page ? page.entityId : null,
    recaptchaSiteKey: settings?.reCaptcha.isEnabledOnStorefront
      ? settings.reCaptcha.siteKey
      : undefined,
  };
});
