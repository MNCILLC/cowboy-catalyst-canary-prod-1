'use client';

import { X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useTransition } from 'react';

import { Stream, Streamable } from '@/vibes/soul/lib/streamable';
import { Button } from '@/vibes/soul/primitives/button';
import { CursorPaginationInfo } from '@/vibes/soul/primitives/cursor-pagination';

import {
  clearAppliedFilters,
  getAppliedFilters,
  removeAppliedFilter,
} from './applied-filters-state';
import { getFilterParsers } from './filter-parsers';
import { Filter } from './filters-panel';

interface Props {
  filters: Streamable<Filter[]>;
  paginationInfo?: Streamable<CursorPaginationInfo>;
}

export function AppliedFilters({ filters, paginationInfo }: Props) {
  return (
    <Stream value={Streamable.all([filters, paginationInfo])}>
      {([resolvedFilters, pagination]) => (
        <AppliedFiltersInner filters={resolvedFilters} paginationInfo={pagination} />
      )}
    </Stream>
  );
}

function AppliedFiltersInner({
  filters,
  paginationInfo,
}: {
  filters: Filter[];
  paginationInfo?: CursorPaginationInfo;
}) {
  const t = useTranslations('Faceted.FacetedSearch.Applied');
  const format = useFormatter();
  const cursorParams = [
    paginationInfo?.startCursorParamName ?? 'before',
    paginationInfo?.endCursorParamName ?? 'after',
  ];
  const [isPending, startTransition] = useTransition();
  const [params, setParams] = useQueryStates(
    {
      ...getFilterParsers(filters),
      ...Object.fromEntries(cursorParams.map((name) => [name, parseAsString])),
    },
    { shallow: false, history: 'push' },
  );
  const chips = getAppliedFilters(filters, params, (value) => format.number(value));

  if (!chips.length) return null;

  return (
    <div
      aria-busy={isPending}
      aria-label={t('label')}
      className="mb-6 flex flex-wrap items-center gap-2"
      data-pending={isPending ? true : null}
      role="group"
    >
      {chips.map((chip) => (
        <Button
          aria-label={t('remove', { label: chip.label, value: chip.valueLabel })}
          className="max-w-full text-left"
          key={chip.id}
          onClick={() => {
            startTransition(async () => {
              await setParams((current) => removeAppliedFilter(chip, current, cursorParams));
            });
          }}
          size="small"
          variant="tertiary"
        >
          <span className="min-w-0 break-words font-normal">
            {chip.label}: <strong className="font-semibold">{chip.valueLabel}</strong>
          </span>
          <X aria-hidden="true" className="shrink-0" size={16} />
        </Button>
      ))}
      <Button
        onClick={() => {
          startTransition(async () => {
            await setParams(clearAppliedFilters(filters, cursorParams));
          });
        }}
        size="small"
        variant="ghost"
      >
        {t('clearAll')}
      </Button>
    </div>
  );
}
