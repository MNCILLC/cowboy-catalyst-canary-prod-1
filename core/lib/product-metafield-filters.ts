export const productFilterDefinitions = [
  { siteKey: 'color_filters', productKey: 'colors' },
  { siteKey: 'effect_filters', productKey: 'effects' },
  { siteKey: 'firing_pattern_filters', productKey: 'firing_patterns' },
  { siteKey: 'caliber_filters', productKey: 'caliber' },
  {
    siteKey: 'performance_height_filters',
    productKey: 'performance_height',
  },
  { siteKey: 'duration_filters', productKey: 'duration' },
  { siteKey: 'ignition_type_filters', productKey: 'ignition_types' },
] as const;

const numericAttributeUnits = new Map([
  ['caliber', 'mm'],
  ['performance_height', 'ft'],
  ['duration', 'sec'],
]);

export interface MetafieldFilterOption {
  label: string;
  value: string;
  swatchColor?: string;
  min?: number;
  max?: number | null;
}

export interface MetafieldValue {
  key: string;
  value: string;
}

// A null maximum represents an open-ended range. Missing or invalid bounds do not match.
function parseFilterRange(option: unknown): { min: number; max: number | null } | undefined {
  if (
    typeof option !== 'object' ||
    option === null ||
    !('min' in option) ||
    typeof option.min !== 'number' ||
    !Number.isFinite(option.min) ||
    option.min < 0 ||
    !('max' in option)
  )
    return undefined;

  if (option.max === null) return { min: option.min, max: null };

  if (typeof option.max !== 'number' || !Number.isFinite(option.max) || option.max < option.min) {
    return undefined;
  }

  return { min: option.min, max: option.max };
}

export function parseNumericAttribute(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);

    return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseFilterOptions(value: string, includeColor = false): MetafieldFilterOption[] {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) return [];

    const options: MetafieldFilterOption[] = [];
    const seen = new Set<string>();

    parsed.forEach((option: unknown) => {
      if (
        typeof option !== 'object' ||
        option === null ||
        !('label' in option) ||
        typeof option.label !== 'string' ||
        !('value' in option) ||
        typeof option.value !== 'string' ||
        !option.label.trim() ||
        !option.value.trim() ||
        seen.has(option.value)
      )
        return;

      const swatchColor = includeColor
        ? [
            'hex_value' in option ? option.hex_value : undefined,
            'color_value' in option ? option.color_value : undefined,
          ].find(
            (color): color is string =>
              typeof color === 'string' &&
              /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color),
          )
        : undefined;

      options.push({
        label: option.label,
        value: option.value,
        ...(swatchColor ? { swatchColor } : {}),
        ...parseFilterRange(option),
      });
      seen.add(option.value);
    });

    return options;
  } catch {
    return [];
  }
}

export function parseAttributeValues(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function getMetafieldSelections(params: Record<string, unknown>) {
  return productFilterDefinitions.flatMap(({ productKey }) => {
    const raw = params[`mf_${productKey}`];
    const values = [
      ...new Set(
        (Array.isArray(raw) ? raw : [raw])
          .filter((value): value is string => typeof value === 'string')
          .flatMap((value) => value.split(','))
          .filter(Boolean),
      ),
    ];

    return values.length > 0 ? [{ key: productKey, values }] : [];
  });
}

export function matchesMetafieldSelections(
  metafields: MetafieldValue[],
  selections: Array<{ key: string; values: string[] }>,
  filters: ProductAttributeFilter[] = [],
): boolean {
  return selections.every(({ key, values }) => {
    if (values.length === 0) return true;

    if (numericAttributeUnits.has(key)) {
      return matchesNumericSelection(key, metafields, values, filters);
    }

    const attributes = metafields
      .filter((field) => field.key === key)
      .flatMap((field) => parseAttributeValues(field.value));

    return values.some((value) => attributes.includes(value));
  });
}

function matchesNumericSelection(
  productKey: string,
  metafields: MetafieldValue[],
  values: string[],
  filters: ProductAttributeFilter[],
): boolean {
  const numericValue = parseNumericAttribute(
    metafields.find(({ key }) => key === productKey)?.value,
  );

  if (numericValue === undefined) return false;

  const options = filters.find(({ paramName }) => paramName === `mf_${productKey}`)?.options ?? [];

  return options.some((option) => {
    const range = parseFilterRange(option);

    return (
      values.includes(option.value) &&
      range !== undefined &&
      numericValue >= range.min &&
      (range.max === null || numericValue <= range.max)
    );
  });
}

// These cursors refer to positions in the fully filtered, sorted result list.
export function paginateMetafieldMatches(
  ids: number[],
  {
    after,
    before,
    limit,
  }: { after?: string | null; before?: string | null; limit?: number | null },
) {
  const size = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit || 9))) : 9;
  const position = (cursor?: string | null) =>
    cursor && /^mf:\d+$/.test(cursor) ? Number(cursor.slice(3)) : undefined;
  const afterIndex = position(after);
  const beforeIndex = position(before);
  let requestedStart = afterIndex !== undefined ? afterIndex + 1 : 0;

  if (beforeIndex !== undefined) requestedStart = beforeIndex - size;

  const lastStart = Math.max(0, Math.floor((ids.length - 1) / size) * size);
  const start = Math.max(0, Math.min(requestedStart, lastStart));
  const page = ids.slice(start, start + size);

  return {
    ids: page,
    collectionInfo: { totalItems: ids.length },
    pageInfo: {
      hasPreviousPage: start > 0,
      hasNextPage: start + page.length < ids.length,
      startCursor: page.length ? `mf:${start}` : null,
      endCursor: page.length ? `mf:${start + page.length - 1}` : null,
    },
  };
}

export interface ProductAttributeFilter {
  paramName: string;
  label: string;
  options: MetafieldFilterOption[];
}

export function getProductAttributes(
  metafields: MetafieldValue[],
  filters: ProductAttributeFilter[] = [],
) {
  return productFilterDefinitions.flatMap(({ productKey }) => {
    const filter = filters.find(({ paramName }) => paramName === `mf_${productKey}`);

    if (!filter) return [];

    const values = getAttributeOptions(productKey, metafields, filter);

    return values.length ? [{ key: productKey, label: filter.label, values }] : [];
  });
}

function getAttributeOptions(
  productKey: string,
  metafields: MetafieldValue[],
  filter: ProductAttributeFilter,
): MetafieldFilterOption[] {
  const unit = numericAttributeUnits.get(productKey);

  if (unit !== undefined) {
    const numericValue = parseNumericAttribute(
      metafields.find(({ key }) => key === productKey)?.value,
    );

    return numericValue === undefined
      ? []
      : [{ value: String(numericValue), label: `${numericValue} ${unit}` }];
  }

  return [
    ...new Set(
      metafields
        .filter(({ key }) => key === productKey)
        .flatMap(({ value }) => parseAttributeValues(value))
        .filter((value) => value.trim()),
    ),
  ].map(
    (value) => filter.options.find((option) => option.value === value) ?? { value, label: value },
  );
}
