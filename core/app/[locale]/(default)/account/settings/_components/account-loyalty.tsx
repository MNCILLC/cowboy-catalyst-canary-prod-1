import { unstable_rethrow as rethrow } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';

import { AccountLoyaltyCard } from '@/vibes/soul/sections/account-settings/loyalty-card';
import { getAccountLoyaltyBalance } from '~/lib/loyalty/server';

export async function AccountLoyalty() {
  const t = await getTranslations('Account.Settings.Loyalty');
  const format = await getFormatter();

  try {
    const balance = await getAccountLoyaltyBalance();

    if (!balance?.enabled) return null;

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

    return (
      <section
        aria-label={t('title')}
        className="my-6 rounded-xl border border-[hsl(var(--contrast-200))] p-6"
      >
        <h2 className="text-xl font-medium">{t('title')}</h2>
        <p className="mt-2 text-sm" role="status">
          {t('unavailable')}
        </p>
      </section>
    );
  }
}
