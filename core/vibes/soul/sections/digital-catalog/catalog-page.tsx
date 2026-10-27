'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Page } from 'react-pdf';

import { getCatalogPageSlice } from './page-mapping';

interface Props {
  pageNumber: number;
  width: number;
  twoUp: boolean;
  pdfUrl: string;
}

export function CatalogPage({ pageNumber, width, twoUp, pdfUrl }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  const { pdfPage, half } = getCatalogPageSlice(pageNumber, twoUp);
  const renderWidth = twoUp ? width * 2 : width;

  // CSS clipping preserves PDF text and links, but clipped links must also be
  // removed from keyboard navigation and the accessibility tree.
  const updateClippedContent = useCallback(() => {
    const frame = frameRef.current;

    if (!frame || !half) return;

    const visible = frame.getBoundingClientRect();

    frame
      .querySelectorAll<HTMLElement>('.textLayer span, .annotationLayer > section')
      .forEach((element) => {
        const bounds = element.getBoundingClientRect();
        const hidden = bounds.right <= visible.left || bounds.left >= visible.right;

        element.inert = hidden;

        if (hidden) element.setAttribute('aria-hidden', 'true');
        else element.removeAttribute('aria-hidden');
      });
  }, [half]);

  useEffect(() => {
    updateClippedContent();
  }, [rendered, updateClippedContent, width]);

  return (
    <div
      aria-label={`Catalog page ${pageNumber}`}
      className="h-fit shrink-0 bg-white shadow-lg"
      role="group"
      style={{ width }}
    >
      {!rendered && !failed && (
        <p className="p-8" role="status">
          Loading page {pageNumber}…
        </p>
      )}
      {failed && (
        <p className="p-8" role="alert">
          This page could not be displayed.{' '}
          <a className="underline" href={pdfUrl} rel="noopener noreferrer" target="_blank">
            Open PDF
          </a>
        </p>
      )}
      <div className="overflow-hidden" hidden={failed} ref={frameRef}>
        <div style={{ width: renderWidth, marginLeft: half === 'right' ? -width : 0 }}>
          <Page
            devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
            error={null}
            loading={null}
            onLoadError={() => setFailed(true)}
            onRenderAnnotationLayerSuccess={updateClippedContent}
            onRenderError={() => setFailed(true)}
            onRenderSuccess={() => setRendered(true)}
            onRenderTextLayerSuccess={updateClippedContent}
            pageNumber={pdfPage}
            renderForms={false}
            width={renderWidth}
          />
        </div>
      </div>
    </div>
  );
}
