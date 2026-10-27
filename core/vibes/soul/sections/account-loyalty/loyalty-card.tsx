import { ReactNode } from 'react';

interface Props {
  history?: ReactNode;
  title: string;
  availableLabel: string;
  available: string;
  description: string;
  pointsLabel: string;
  expiresLabel: string;
  scheduleLabel: string;
  nextExpiry?: string;
  expirations: Array<{ points: string; expiresAt: string; date: string }>;
}

export function AccountLoyaltyCard({
  history,
  title,
  availableLabel,
  available,
  description,
  pointsLabel,
  expiresLabel,
  scheduleLabel,
  nextExpiry,
  expirations,
}: Props) {
  return (
    <section aria-label={title} className="w-full @container">
      <header className="mb-6 min-h-[72px] border-b border-[hsl(var(--contrast-100))]">
        <h1 className="font-[family-name:var(--font-family-heading)] text-4xl font-medium leading-none tracking-tight">
          {title}
        </h1>
      </header>
      <div className="mt-5 grid gap-6 @2xl:grid-cols-2">
        <div>
          <p className="text-sm text-[hsl(var(--contrast-500))]">{availableLabel}</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums">{available}</p>
          <p className="mt-3 max-w-sm text-sm text-[hsl(var(--contrast-500))]">{description}</p>
          {nextExpiry != null && <p className="mt-3 text-sm">{nextExpiry}</p>}
        </div>
        {expirations.length > 0 && (
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-3 text-left font-medium">{scheduleLabel}</caption>
              <thead>
                <tr className="border-b border-[hsl(var(--contrast-200))]">
                  <th className="pb-2 pr-4 font-medium" scope="col">
                    {pointsLabel}
                  </th>
                  <th className="pb-2 font-medium" scope="col">
                    {expiresLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {expirations.map((entry) => (
                  <tr
                    className="border-b border-[hsl(var(--contrast-100))] last:border-0"
                    key={entry.expiresAt}
                  >
                    <td className="py-3 pr-4 tabular-nums">{entry.points}</td>
                    <td className="py-3">
                      <time dateTime={entry.expiresAt}>{entry.date}</time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {history}
    </section>
  );
}
