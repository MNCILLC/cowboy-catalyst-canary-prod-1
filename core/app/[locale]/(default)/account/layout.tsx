import { unstable_rethrow as rethrow } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PropsWithChildren } from 'react';

import { Streamable } from '@/vibes/soul/lib/streamable';
import { SidebarMenu } from '@/vibes/soul/sections/sidebar-menu';
import { StickySidebarLayout } from '@/vibes/soul/sections/sticky-sidebar-layout';
import { getAccountLoyaltyBalance } from '~/lib/loyalty/server';

interface Props extends PropsWithChildren {
  params: Promise<{ locale: string }>;
}

async function getAccountLinks() {
  const t = await getTranslations('Account.Layout');
  let loyaltyEnabled = false;

  try {
    loyaltyEnabled = (await getAccountLoyaltyBalance())?.enabled ?? false;
  } catch (error) {
    rethrow(error);
    // Keep the account menu available when the loyalty app cannot be reached.
  }

  return [
    { href: '/account/orders/', label: t('orders') },
    ...(loyaltyEnabled ? [{ href: '/account/loyalty-points/', label: t('loyalty') }] : []),
    { href: '/account/addresses/', label: t('addresses') },
    { href: '/account/settings/', label: t('settings') },
    { href: '/account/wishlists/', label: t('wishlists') },
    { href: '/logout', label: t('logout'), prefetch: 'none' as const },
  ];
}

export default async function Layout({ children, params }: Props) {
  const { locale } = await params;

  setRequestLocale(locale);

  return (
    <StickySidebarLayout
      sidebar={<SidebarMenu links={Streamable.from(getAccountLinks)} />}
      sidebarSize="small"
    >
      {children}
    </StickySidebarLayout>
  );
}
