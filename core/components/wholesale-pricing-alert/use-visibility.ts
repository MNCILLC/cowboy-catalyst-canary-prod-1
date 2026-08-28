'use client';

import useSWR from 'swr';
import { z } from 'zod';

const WholesalePricingBannerSchema = z.object({ showBanner: z.boolean() });

const fetchWholesalePricingBanner = (url: string) =>
  fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return WholesalePricingBannerSchema.parse(await response.json());
  });

export function useWholesalePricingBannerVisibility(enabled: boolean) {
  const { data } = useSWR(enabled ? '/api/wholesale-pricing' : null, fetchWholesalePricingBanner);

  return data?.showBanner ?? false;
}
