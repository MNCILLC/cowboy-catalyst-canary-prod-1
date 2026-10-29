'use client';

import { useState } from 'react';

import { Image } from '~/components/image';

interface Props {
  value: string;
  label: string;
  decorative?: boolean;
}

export function ProductFiringAngleIcon({ value, label, decorative = false }: Props) {
  const [failedValue, setFailedValue] = useState<string>();
  // Metafield values name local SVG files, never URLs or directory paths.
  const validFilename = /^[a-z0-9][a-z0-9_-]*$/i.test(value);

  if (!validFilename || failedValue === value) {
    return decorative ? null : <span>{label}</span>;
  }

  return (
    <Image
      alt={decorative ? '' : label}
      className="h-8 w-10 shrink-0 rounded-sm object-contain p-0.5"
      height={32}
      onError={() => setFailedValue(value)}
      src={`/images/${encodeURIComponent(value)}.svg`}
      title={label}
      unoptimized
      width={40}
    />
  );
}
