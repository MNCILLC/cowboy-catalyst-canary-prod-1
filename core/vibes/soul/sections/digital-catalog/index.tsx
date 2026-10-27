'use client';

import { clsx } from 'clsx';
import dynamic from 'next/dynamic';

export interface DigitalCatalogProps {
  className?: string;
  pdfFile?: string;
  pdfUrl?: string;
  title?: string;
  description?: string;
  showDownload?: boolean;
  downloadLabel?: string;
  downloadFilename?: string;
  pageLayout?: 'single' | 'spread';
}

// PDF.js requires browser APIs. Keep it out of server rendering and load it on demand.
const CatalogReader = dynamic(() => import('./reader').then((module) => module.CatalogReader), {
  ssr: false,
  loading: () => (
    <p className="p-12 text-center" role="status">
      Loading catalog viewer…
    </p>
  ),
});

function getPdfUrl(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, 'https://catalog.invalid');

    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return url.href;
  } catch {
    return null;
  }

  return null;
}

export function DigitalCatalog({
  className,
  pdfFile = '',
  pdfUrl = '',
  title = 'Digital catalog',
  description,
  ...props
}: DigitalCatalogProps) {
  const selectedSource = pdfFile.trim() || pdfUrl;
  const source = getPdfUrl(selectedSource);

  return (
    <section aria-label={title || 'Digital catalog'} className={clsx('w-full min-w-0', className)}>
      {Boolean(title || description) && (
        <header className="mb-6 space-y-2">
          {Boolean(title) && <h2 className="font-heading text-3xl font-medium">{title}</h2>}
          {Boolean(description) && <p className="text-base">{description}</p>}
        </header>
      )}
      {source ? (
        <CatalogReader key={source} {...props} pdfUrl={source} title={title || 'Digital catalog'} />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-gray-600">
          {selectedSource.trim()
            ? 'Select a valid PDF file or enter a PDF URL to display this catalog.'
            : 'Choose a PDF from the file library in the Digital Catalog settings to display your catalog.'}
        </div>
      )}
    </section>
  );
}
