'use client';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function BackToListLink() {
  const t = useTranslations('Product.ProductDetails');

  return (
    <button
      className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-[var(--product-detail-secondary-text,hsl(var(--contrast-500)))] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => window.history.go(-1)}
      type="button"
    >
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
      {t('backToList')}
    </button>
  );
}
