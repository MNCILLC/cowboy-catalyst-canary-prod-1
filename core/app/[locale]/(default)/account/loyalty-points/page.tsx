import { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { AccountLoyalty } from './_components/account-loyalty';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Account.Loyalty' });

  return { title: t('title') };
}

export default async function LoyaltyPoints({ params, searchParams }: Props) {
  const { locale } = await params;

  setRequestLocale(locale);

  return (
    <Suspense fallback={null}>
      <AccountLoyalty searchParams={searchParams} />
    </Suspense>
  );
}
