import { Link } from '~/components/link';

interface Props {
  title: string;
  description: string;
  dateLabel: string;
  activityLabel: string;
  pointsLabel: string;
  orderLabel: string;
  empty: string;
  notice?: string;
  legacyNote?: string;
  entries: Array<{
    id: string;
    dateTime: string | null;
    date: string;
    activity: string;
    points: string;
    order: string;
    href: string;
  }>;
  pagination?: {
    label: string;
    status: string;
    previousLabel: string;
    nextLabel: string;
    previousHref?: string;
    nextHref?: string;
  };
}

export function LoyaltyHistory({
  title,
  description,
  dateLabel,
  activityLabel,
  pointsLabel,
  orderLabel,
  empty,
  notice,
  legacyNote,
  entries,
  pagination,
}: Props) {
  return (
    <div className="mt-6 border-t border-[hsl(var(--contrast-200))] pt-5" id="loyalty-history">
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm text-[hsl(var(--contrast-500))]">{description}</p>
      {notice != null && (
        <p className="mt-3 text-sm" role="status">
          {notice}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="mt-4 text-sm">{empty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table aria-label={title} className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--contrast-200))]">
                <th className="pb-2 pr-4 font-medium" scope="col">
                  {dateLabel}
                </th>
                <th className="pb-2 pr-4 font-medium" scope="col">
                  {activityLabel}
                </th>
                <th className="pb-2 pr-4 text-right font-medium" scope="col">
                  {pointsLabel}
                </th>
                <th className="pb-2 font-medium" scope="col">
                  {orderLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  className="border-b border-[hsl(var(--contrast-100))] last:border-0"
                  key={entry.id}
                >
                  <td className="whitespace-nowrap py-3 pr-4">
                    {entry.dateTime ? (
                      <time dateTime={entry.dateTime}>{entry.date}</time>
                    ) : (
                      entry.date
                    )}
                  </td>
                  <td className="py-3 pr-4">{entry.activity}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-right font-medium tabular-nums">
                    {entry.points}
                  </td>
                  <td className="whitespace-nowrap py-3">
                    <Link className="underline underline-offset-4" href={entry.href}>
                      {entry.order}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {legacyNote != null && (
        <p className="mt-3 text-xs text-[hsl(var(--contrast-500))]">{legacyNote}</p>
      )}
      {pagination && (
        <nav
          aria-label={pagination.label}
          className="mt-4 flex flex-wrap items-center gap-4 text-sm"
        >
          {pagination.previousHref != null && (
            <Link className="underline" href={pagination.previousHref}>
              {pagination.previousLabel}
            </Link>
          )}
          <span>{pagination.status}</span>
          {pagination.nextHref != null && (
            <Link className="underline" href={pagination.nextHref}>
              {pagination.nextLabel}
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
