import { notFound, unstable_rethrow as rethrow } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { AccountLoyaltyCard } from '@/vibes/soul/sections/account-loyalty/loyalty-card';
import { getAccountLoyaltyBalance } from '~/lib/loyalty/server';

import { AccountLoyaltyHistory } from './account-loyalty-history';

export async function AccountLoyalty({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('Account.Loyalty');
  const format = await getFormatter();

  try {
    const balance = await getAccountLoyaltyBalance();

    if (!balance?.enabled) notFound();

    return (
      <AccountLoyaltyCard
        available={format.number(balance.available)}
        availableLabel={t('available')}
        description={balance.available > 0 ? t('description') : t('empty')}
        expirations={(balance.expirations ?? []).map((entry) => ({
          points: format.number(entry.points),
          expiresAt: entry.expiresAt,
          date: format.dateTime(new Date(entry.expiresAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'UTC',
          }),
        }))}
        expiresLabel={t('expires')}
        history={
          <Suspense fallback={null}>
            <AccountLoyaltyHistory searchParams={searchParams} />
          </Suspense>
        }
        nextExpiry={
          balance.expirations === undefined && balance.nextExpiry && balance.available > 0
            ? t('nextExpiry', {
                date: format.dateTime(new Date(balance.nextExpiry), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'UTC',
                }),
              })
            : undefined
        }
        pointsLabel={t('points')}
        scheduleLabel={t('schedule')}
        title={t('title')}
      />
    );
  } catch (error) {
    rethrow(error);

    // Render loyalty only when the app has confirmed this store's program is enabled.
    notFound();
  }
}
