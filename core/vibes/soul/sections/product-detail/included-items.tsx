import { Check } from 'lucide-react';

interface Props {
  items: string[];
  title: string;
}

export function IncludedItems({ items, title }: Props) {
  if (items.length === 0) return null;

  return (
    <section aria-label={title} className="bg-stone-200 @container">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 @xl:px-6 @xl:py-14 @4xl:px-8">
        <h2 className="mb-6 font-[family-name:var(--product-detail-title-font-family,var(--font-family-heading))] text-2xl font-medium text-[var(--product-detail-primary-text,hsl(var(--foreground)))] @xl:text-3xl @4xl:text-4xl">
          {title}
        </h2>
        <ul className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3 @4xl:gap-6">
          {items.map((item, index) => (
            <li
              className="flex min-w-0 items-center gap-4 rounded-2xl bg-white p-6 text-sm leading-relaxed text-slate-900 shadow-sm"
              key={index}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-700 text-white">
                <Check aria-hidden="true" className="size-3" strokeWidth={3} />
              </span>
              <span className="min-w-0 whitespace-pre-line break-words">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
