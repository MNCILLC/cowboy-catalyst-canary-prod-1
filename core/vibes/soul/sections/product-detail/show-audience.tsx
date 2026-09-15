import { clsx } from 'clsx';
import { ReactNode } from 'react';

interface Props {
  items: string[];
  message?: ReactNode;
  title: string;
}

export function ShowAudience({ items, message, title }: Props) {
  if (items.length === 0 && !message) return null;

  return (
    <section aria-label={title} className="@container">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-10 @xl:px-6 @xl:py-14 @4xl:px-8">
        <h2 className="mb-6 font-[family-name:var(--product-detail-title-font-family,var(--font-family-heading))] text-2xl font-medium uppercase text-[var(--product-detail-primary-text,hsl(var(--foreground)))] @xl:text-3xl @4xl:text-4xl">
          {title}
        </h2>
        <div
          className={clsx(
            'grid grid-cols-1 items-start gap-8 @4xl:gap-12',
            items.length > 0 && message && '@2xl:grid-cols-2',
          )}
        >
          {items.length > 0 && (
            <ul className="min-w-0 list-disc space-y-4 pl-6 text-base leading-relaxed text-[var(--product-detail-primary-text,hsl(var(--foreground)))] marker:text-red-700 @xl:text-lg">
              {items.map((item, index) => (
                <li className="break-words pl-2" key={index}>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {Boolean(message) && (
            <div className="min-w-0 rounded-2xl bg-stone-100 p-6 @xl:p-8">
              <div className="prose prose-sm max-w-none break-words text-slate-900 prose-headings:font-[family-name:var(--font-family-heading)] prose-headings:text-slate-900 prose-a:text-blue-700 [&>div>*:first-child]:mt-0 [&>div>*:last-child]:mb-0">
                {message}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
