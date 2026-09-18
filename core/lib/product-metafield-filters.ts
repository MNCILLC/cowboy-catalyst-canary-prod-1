export const productFilterDefinitions = [
  { siteKey: 'color_filters', productKey: 'colors' },
  { siteKey: 'effect_filters', productKey: 'effects' },
  { siteKey: 'firing_pattern_filters', productKey: 'firing_patterns' },
  { siteKey: 'caliber_filters', productKey: 'calibers' },
  {
    siteKey: 'performance_height_filters',
    productKey: 'performance_heights',
  },
  { siteKey: 'duration_filters', productKey: 'durations' },
  { siteKey: 'ignition_type_filters', productKey: 'ignition_types' },
] as const;

export interface MetafieldFilterOption {
  label: string;
  value: string;
  swatchColor?: string;
}

export interface MetafieldValue {
  key: string;
  value: string;
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
): boolean {
  return selections.every(({ key, values }) => {
    if (values.length === 0) return true;

    const attributes = metafields
      .filter((field) => field.key === key)
      .flatMap((field) => parseAttributeValues(field.value));

    return values.some((value) => attributes.includes(value));
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
