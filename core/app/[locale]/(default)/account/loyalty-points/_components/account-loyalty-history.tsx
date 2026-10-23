import { unstable_rethrow as rethrow } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';

import { LoyaltyHistory } from '@/vibes/soul/sections/account-loyalty/loyalty-history';
import { getAccountLoyaltyHistory } from '~/lib/loyalty/server';

export async function AccountLoyaltyHistory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('Account.Loyalty.History');
  const format = await getFormatter();

  try {
    const { loyaltyPage } = await searchParams;
    const requestedPage = typeof loyaltyPage === 'string' ? Number(loyaltyPage) : 1;
    const page =
      Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000
        ? requestedPage
        : 1;
    const history = await getAccountLoyaltyHistory(page);

    if (!history?.enabled) return null;

    return (
      <LoyaltyHistory
        activityLabel={t('activity')}
        dateLabel={t('date')}
        description={t('description')}
        empty={t('empty')}
        entries={history.entries.map((entry) => ({
          id: entry.id,
          dateTime: entry.date,
          date: entry.date
            ? format.dateTime(new Date(entry.date), {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'UTC',
              })
            : t('unknownDate'),
          activity: entry.legacy ? t('recordedEarnings') : t(entry.type),
          points: format.number(entry.points, { signDisplay: 'exceptZero' }),
          order: t('orderNumber', { number: String(entry.orderId) }),
          href: `/account/orders/${entry.orderId}`,
        }))}
        legacyNote={history.entries.some((entry) => entry.legacy) ? t('legacy') : undefined}
        notice={history.incomplete ? t('incomplete') : undefined}
        orderLabel={t('order')}
        pagination={
          history.pages > 1
            ? {
                label: t('pagination'),
                status: t('page', {
                  page: format.number(history.page),
                  pages: format.number(history.pages),
                }),
                previousLabel: t('previous'),
                nextLabel: t('next'),
                previousHref:
                  history.page > 1
                    ? `/account/loyalty-points?loyaltyPage=${history.page - 1}#loyalty-history`
                    : undefined,
                nextHref:
                  history.page < history.pages
                    ? `/account/loyalty-points?loyaltyPage=${history.page + 1}#loyalty-history`
                    : undefined,
              }
            : undefined
        }
        pointsLabel={t('points')}
        title={t('title')}
      />
    );
  } catch (error) {
    rethrow(error);

    return (
      <div className="mt-6 border-t border-[hsl(var(--contrast-200))] pt-5" id="loyalty-history">
        <h2 className="text-lg font-medium">{t('title')}</h2>
        <p className="mt-2 text-sm" role="status">
          {t('unavailable')}
        </p>
      </div>
    );
  }
}
