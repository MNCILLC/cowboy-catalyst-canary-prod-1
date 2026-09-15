/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The overflow region needs focus for keyboard scrolling. */
import { clsx } from 'clsx';

import { Price, PriceLabel } from '@/vibes/soul/primitives/price-label';
import { Link } from '~/components/link';

export interface ShowComparisonData {
  products: Array<{
    id: string;
    title: string;
    href: string;
    fields: Array<{ name: string; value: string }>;
    price?: Price;
  }>;
  features: string[];
}

interface Props {
  currentProductId: string;
  data: ShowComparisonData;
  title: string;
  featureLabel: string;
  priceLabel: string;
  unavailablePriceLabel: string;
}

export function ShowComparison({
  currentProductId,
  data: { products, features },
  title,
  featureLabel,
  priceLabel,
  unavailablePriceLabel,
}: Props) {
  if (products.length === 0) return null;

  return (
    <section aria-label={title} className="bg-stone-300 @container">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-10 @xl:px-6 @xl:py-14 @4xl:px-8">
        <h2 className="mb-6 font-[family-name:var(--product-detail-title-font-family,var(--font-family-heading))] text-2xl font-medium uppercase text-[var(--product-detail-primary-text,hsl(var(--foreground)))] @xl:text-3xl @4xl:text-4xl">
          {title}
        </h2>
        <div
          aria-label={title}
          className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-400 [&::-webkit-scrollbar-track]:bg-stone-200 [&::-webkit-scrollbar]:h-2"
          role="region"
          tabIndex={0}
        >
          <table className="w-full border-collapse whitespace-nowrap text-left text-sm text-slate-900">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="px-6 py-5 text-xs font-semibold uppercase" scope="col">
                  {featureLabel}
                </th>
                {products.map((product) => (
                  <th
                    className={clsx(
                      'min-w-40 px-6 py-5 text-center text-xs font-semibold',
                      product.id === currentProductId && 'bg-blue-700',
                    )}
                    key={product.id}
                    scope="col"
                  >
                    <Link
                      aria-current={product.id === currentProductId ? 'page' : undefined}
                      className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      href={product.href}
                    >
                      {product.title}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="whitespace-normal break-words text-xs">
              {features.map((feature) => (
                <tr className="border-t border-stone-200 even:bg-stone-50" key={feature}>
                  <th className="px-6 py-4 font-medium" scope="row">
                    {feature}
                  </th>
                  {products.map((product) => (
                    <td
                      className={clsx(
                        'px-6 py-4 text-center',
                        product.id === currentProductId && 'bg-blue-50',
                      )}
                      key={product.id}
                    >
                      {product.fields.find((field) => field.name === feature)?.value ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 bg-stone-100">
                <th className="px-6 py-5 font-semibold" scope="row">
                  {priceLabel}
                </th>
                {products.map((product) => (
                  <td
                    className={clsx(
                      'px-6 py-5 text-center',
                      product.id === currentProductId && 'bg-blue-100',
                    )}
                    key={product.id}
                  >
                    <PriceLabel price={product.price ?? unavailablePriceLabel} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
