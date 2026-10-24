'use client';

import { clsx } from 'clsx';
import { useId, useState } from 'react';

interface Props {
  color: string;
  borderClassName: string;
}

// Only accept a filename from public/images, never a URL or a relative path.
const imageName = process.env.NEXT_PUBLIC_CUSTOM_SWATCH_IMAGE?.trim() ?? '';
const imageUrl =
  process.env.NEXT_PUBLIC_USE_CUSTOM_SWATCH === 'true' &&
  /^[a-z0-9][a-z0-9._ -]*\.svg$/i.test(imageName)
    ? `/images/${encodeURIComponent(imageName)}`
    : undefined;

export function ProductColorSwatch({ color, borderClassName }: Props) {
  const maskId = useId();
  const [imageFailed, setImageFailed] = useState(false);

  if (!imageUrl || imageFailed) {
    return (
      <span
        aria-hidden="true"
        className={clsx('h-3.5 w-3.5 shrink-0 rounded-full border', borderClassName)}
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-6 shrink-0 overflow-visible drop-shadow-[0_0_0.5px_#737373]"
      focusable="false"
      viewBox="0 0 24 14"
    >
      <defs>
        {/* Alpha preserves the SVG silhouette regardless of its original fill color. */}
        <mask
          height="14"
          id={maskId}
          maskUnits="userSpaceOnUse"
          style={{ maskType: 'alpha' }}
          width="24"
          x="0"
          y="0"
        >
          <image
            height="14"
            href={imageUrl}
            // eslint-disable-next-line react/no-unknown-property -- React supports error events on SVG images.
            onError={() => setImageFailed(true)}
            preserveAspectRatio="xMidYMid meet"
            width="24"
          />
        </mask>
      </defs>
      <rect fill={color} height="14" mask={`url(#${maskId})`} width="24" />
    </svg>
  );
}
