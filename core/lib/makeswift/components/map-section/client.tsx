'use client';

import { useLocale, useTranslations } from 'next-intl';
import { forwardRef } from 'react';
import useSWR from 'swr';

import { MapSection } from '@/vibes/soul/sections/map-section';
import { loadMapShippingOrigin } from '~/lib/map-section/actions';

interface Props {
  className?: string;
  addressOverride?: string;
  title?: string;
  height?: number;
  zoom?: number;
}

export const MSMapSection = forwardRef<HTMLDivElement, Props>(function MSMapSection(
  { className, addressOverride, title, height = 400, zoom = 13 },
  ref,
) {
  const locale = useLocale();
  const t = useTranslations('MapSection');
  const override = addressOverride?.trim();
  const { data, error, isLoading } = useSWR<string | null, Error>(
    override ? null : ['map-shipping-origin', locale],
    () => loadMapShippingOrigin(),
  );
  const address = override || data;

  return (
    <div className={className} ref={ref}>
      {address ? (
        <MapSection address={address} height={height} title={title || t('title')} zoom={zoom} />
      ) : (
        <div
          aria-busy={isLoading}
          className="flex items-center justify-center bg-contrast-100 px-6 text-center text-contrast-500"
          role={error ? 'alert' : 'status'}
          style={{ height: Math.min(1000, Math.max(200, height)) }}
        >
          {isLoading ? t('loading') : t('unavailable')}
        </div>
      )}
    </div>
  );
});
