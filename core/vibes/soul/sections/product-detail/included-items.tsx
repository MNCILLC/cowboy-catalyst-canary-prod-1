'use client';

import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  items: string[];
  title: string;
}

export function IncludedItems({ items, title }: Props) {
  const gridRef = useRef<HTMLUListElement>(null);
  const [columns, setColumns] = useState<number>();

  useEffect(() => {
    const grid = gridRef.current;

    if (!grid) return;

    const measurements = grid.querySelectorAll<HTMLElement>('[data-included-item-width]');
    const updateColumns = () => {
      const gridStyles = getComputedStyle(grid);
      const gap = parseFloat(gridStyles.columnGap) || 0;
      const maxColumns = Number(gridStyles.getPropertyValue('--included-items-max-columns')) || 1;
      let requiredWidth = 0;

      measurements.forEach((measurement) => {
        const card = measurement.closest('li');
        const icon = card?.firstElementChild;

        if (!card || !icon) return;

        const cardStyles = getComputedStyle(card);

        requiredWidth = Math.max(
          requiredWidth,
          measurement.getBoundingClientRect().width +
            icon.getBoundingClientRect().width +
            parseFloat(cardStyles.columnGap) +
            parseFloat(cardStyles.paddingLeft) +
            parseFloat(cardStyles.paddingRight),
        );
      });

      const fittingColumns = Math.floor(
        (grid.clientWidth + gap) / (Math.ceil(requiredWidth) + gap),
      );

      setColumns(Math.max(1, Math.min(maxColumns, fittingColumns)));
    };

    // Intrinsic text widths stay independent of the current column count, so
    // the grid can regain columns when it grows without oscillating on resize.
    const observer = new ResizeObserver(updateColumns);

    observer.observe(grid);
    measurements.forEach((measurement) => observer.observe(measurement));
    updateColumns();

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section aria-label={title} className="bg-stone-200 @container">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-10 @xl:px-6 @xl:py-14 @4xl:px-8">
        <h2 className="mb-6 font-[family-name:var(--product-detail-title-font-family,var(--font-family-heading))] text-2xl font-medium text-[var(--product-detail-primary-text,hsl(var(--foreground)))] @xl:text-3xl @4xl:text-4xl">
          {title}
        </h2>
        <ul
          className="grid grid-cols-1 gap-4 [--included-items-max-columns:1] @xl:grid-cols-2 @xl:[--included-items-max-columns:2] @4xl:grid-cols-3 @4xl:gap-6 @4xl:[--included-items-max-columns:3]"
          ref={gridRef}
          style={
            columns == null
              ? undefined
              : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
          }
        >
          {items.map((item, index) => (
            <li
              className="flex min-w-0 items-center gap-4 rounded-2xl bg-white p-6 text-sm leading-relaxed text-slate-900 shadow-sm"
              key={index}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-700 text-white">
                <Check aria-hidden="true" className="size-3" strokeWidth={3} />
              </span>
              <span className="relative min-w-0 overflow-hidden whitespace-normal break-words">
                <span
                  aria-hidden="true"
                  className="pointer-events-none invisible absolute left-0 top-0 w-max whitespace-nowrap"
                  data-included-item-width
                >
                  {item}
                </span>
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
