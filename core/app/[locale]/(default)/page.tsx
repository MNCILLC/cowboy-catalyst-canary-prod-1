import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { Streamable } from '@/vibes/soul/lib/streamable';
import { ContentBanners } from '@/vibes/soul/sections/content-banners';
import { getHomePageBanners } from '~/client/queries/get-home-page-banners';
import { rewriteWysiwygContentUrls } from '~/data-transformers/html-content-transformer';
import { locales } from '~/i18n/locales';
import { getMakeswiftPageMetadata, Page as MakeswiftPage } from '~/lib/makeswift';
import { getMetadataAlternates } from '~/lib/seo/canonical';

interface Params {
  locale: string;
}

interface Props {
  params: Promise<Params>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const metadata = await getMakeswiftPageMetadata({ path: '/', locale });

  return {
    ...(metadata?.title != null && { title: metadata.title }),
    ...(metadata?.description != null && { description: metadata.description }),
    alternates: await getMetadataAlternates({ path: '/', locale }),
  };
}

export function generateStaticParams(): Params[] {
  return locales.map((locale) => ({ locale }));
}

export default async function Home({ params }: Props) {
  const { locale } = await params;

  setRequestLocale(locale);

  const banners = Streamable.from(async () =>
    (await getHomePageBanners()).map((banner) => ({
      ...banner,
      content: rewriteWysiwygContentUrls(banner.content),
    })),
  );

  return (
    <>
      <ContentBanners banners={banners} location="TOP" />
      <MakeswiftPage locale={locale} path="/" />
      <ContentBanners banners={banners} location="BOTTOM" />
    </>
  );
}
