import type { Filter, RangeFilter } from './filters-panel';

type Params = Record<string, unknown>;

interface ChipLabel {
  id: string;
  label: string;
  valueLabel: string;
}

export type AppliedFilter = ChipLabel &
  (
    | { type: 'option'; paramName: string; value: string }
    | { type: 'range'; minParamName: string; maxParamName: string }
  );

function selectedValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
  }

  return typeof value === 'string' ? [value] : [];
}

function getRangeChip(
  filter: RangeFilter,
  params: Params,
  formatNumber: (value: number) => string,
): AppliedFilter[] {
  const rawMin = params[filter.minParamName];
  const rawMax = params[filter.maxParamName];
  const min = typeof rawMin === 'number' && Number.isFinite(rawMin) ? rawMin : undefined;
  const max = typeof rawMax === 'number' && Number.isFinite(rawMax) ? rawMax : undefined;

  if (min === undefined && max === undefined) return [];

  let valueLabel = '';

  if (min !== undefined && max !== undefined) {
    valueLabel = `${formatNumber(min)} – ${formatNumber(max)}`;
  } else if (min !== undefined) {
    valueLabel = `≥ ${formatNumber(min)}`;
  } else if (max !== undefined) {
    valueLabel = `≤ ${formatNumber(max)}`;
  }

  return [
    {
      type: 'range',
      id: JSON.stringify([filter.minParamName, filter.maxParamName]),
      label: filter.label,
      valueLabel,
      minParamName: filter.minParamName,
      maxParamName: filter.maxParamName,
    },
  ];
}

export function getAppliedFilters(
  filters: Filter[],
  params: Params,
  formatNumber: (value: number) => string = String,
): AppliedFilter[] {
  return filters.flatMap((filter): AppliedFilter[] => {
    if (filter.type === 'link-group') return [];
    if (filter.type === 'range') return getRangeChip(filter, params, formatNumber);

    return selectedValues(params[filter.paramName]).map((value) => {
      const option =
        filter.type === 'rating' ? undefined : filter.options.find((item) => item.value === value);

      return {
        type: 'option',
        id: JSON.stringify([filter.paramName, value]),
        label: filter.label,
        valueLabel:
          filter.type === 'rating'
            ? `${value} ★`
            : (option?.appliedLabel ?? option?.label ?? value),
        paramName: filter.paramName,
        value,
      };
    });
  });
}

export function removeAppliedFilter(
  chip: AppliedFilter,
  params: Params,
  cursorParams: string[] = ['before', 'after'],
): Record<string, string[] | null> {
  const resetPagination = Object.fromEntries(cursorParams.map((name) => [name, null]));

  if (chip.type === 'range') {
    return { ...resetPagination, [chip.minParamName]: null, [chip.maxParamName]: null };
  }

  const remaining = selectedValues(params[chip.paramName]).filter((value) => value !== chip.value);

  return { ...resetPagination, [chip.paramName]: remaining.length ? remaining : null };
}

export function clearAppliedFilters(
  filters: Filter[],
  cursorParams: string[] = ['before', 'after'],
): Record<string, null> {
  const filterParams = filters.flatMap((filter) => {
    if (filter.type === 'link-group') return [];
    if (filter.type === 'range') return [filter.minParamName, filter.maxParamName];

    return [filter.paramName];
  });

  return Object.fromEntries([...filterParams, ...cursorParams].map((name) => [name, null]));
}
