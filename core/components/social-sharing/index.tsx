import { getTranslations } from 'next-intl/server';

import { SocialSharing } from '@/vibes/soul/primitives/social-sharing';
import { getSocialSharingServices } from '~/client/queries/get-social-sharing';
import { getMetadataAlternates } from '~/lib/seo/canonical';

interface Props {
  path: string;
  locale: string;
  title: string;
  image?: string;
  className?: string;
}

export async function PageSocialSharing({ path, locale, title, image, className = 'mt-6' }: Props) {
  const services = await getSocialSharingServices();

  if (services.length === 0) return null;

  const [{ canonical }, t] = await Promise.all([
    getMetadataAlternates({ path, locale, includeAlternates: false }),
    getTranslations({ locale, namespace: 'SocialSharing' }),
  ]);

  return (
    <div className={className}>
      <SocialSharing
        image={image?.replace('{:size}', '1200w')}
        label={t('label')}
        serviceLabels={{
          facebook: t('facebook'),
          twitter: t('twitter'),
          linkedin: t('linkedin'),
          pinterest: t('pinterest'),
          email: t('email'),
          print: t('print'),
        }}
        services={services}
        title={title}
        url={canonical}
      />
    </div>
  );
}
