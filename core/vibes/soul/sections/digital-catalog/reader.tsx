'use client';

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The named, focusable PDF region supports scoped page-navigation shortcuts and scroll access. */

import { RotateCcw } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { Document, pdfjs } from 'react-pdf';

import { CatalogPage } from './catalog-page';
import { getCatalogPageCount, getCatalogPageForDestination } from './page-mapping';
import { buttonClass, CatalogToolbar } from './toolbar';

import type { DigitalCatalogProps } from './index';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const assetPath = `/pdfjs/${pdfjs.version}`;

pdfjs.GlobalWorkerOptions.workerSrc = `${assetPath}/pdf.worker.min.mjs`;

const documentOptions = {
  cMapUrl: `${assetPath}/cmaps/`,
  standardFontDataUrl: `${assetPath}/standard_fonts/`,
  wasmUrl: `${assetPath}/wasm/`,
  isEvalSupported: false,
};

type ReaderProps = Omit<DigitalCatalogProps, 'className' | 'description'> & {
  pdfUrl: string;
  title: string;
};

export function CatalogReader({
  pdfUrl,
  title,
  showDownload = true,
  downloadLabel = 'Download PDF',
  downloadFilename = 'catalog.pdf',
  pageLayout = 'spread',
  twoUp = false,
}: ReaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageCountRef = useRef(0);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [loadingError, setLoadingError] = useState(false);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [actionError, setActionError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const totalPages = getCatalogPageCount(pdf?.numPages ?? 0, twoUp);
  const spread = pageLayout === 'spread' && width >= 720;
  const firstPage = spread && page > 1 ? page - (page % 2) : page;
  const lastPage = spread && firstPage > 1 ? Math.min(firstPage + 1, totalPages) : firstPage;
  const pageWidth = Math.max(1, Math.floor((width - 48) / (spread ? 2 : 1))) * zoom;

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });

    observer.observe(viewport);
    setCanFullscreen(document.fullscreenEnabled);

    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === rootRef.current);

    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      downloadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    // React-PDF retains its initial link handler; read the loaded count through a ref.
    pageCountRef.current = totalPages;
    viewportRef.current?.scrollTo({ top: 0, left: 0 });
  }, [firstPage, totalPages]);

  function goToPage(requestedPage: number) {
    const availablePages = pageCountRef.current;

    if (!availablePages) return;

    const clamped = Math.min(availablePages, Math.max(1, Math.trunc(requestedPage)));

    setPage(clamped);
  }

  function previousPage() {
    goToPage(spread ? Math.max(1, firstPage - 2) : firstPage - 1);
  }

  function nextPage() {
    goToPage(lastPage + 1);
  }

  async function toggleFullscreen() {
    try {
      if (fullscreen) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      setActionError('Full screen is not available in this browser.');
    }
  }

  async function downloadPdf() {
    const controller = new AbortController();

    downloadAbortRef.current = controller;
    setDownloading(true);
    setActionError('');

    try {
      let blob: Blob;

      if (pdf) {
        const data = await pdf.getData();

        blob = new Blob([new Uint8Array(data)], { type: 'application/pdf' });
      } else {
        const response = await fetch(pdfUrl, {
          signal: controller.signal,
          credentials: 'same-origin',
        });

        if (!response.ok) throw new Error('PDF download failed');

        blob = await response.blob();
      }

      if (controller.signal.aborted) return;

      if (!(await blob.slice(0, 1024).text()).includes('%PDF-')) {
        throw new Error('The response is not a PDF');
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const filename = (downloadFilename.trim() || 'catalog.pdf').replace(/[/\\]/g, '-');

      anchor.href = url;
      anchor.download = /\.pdf$/i.test(filename) ? filename : `${filename}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Keep the URL alive until the browser has started consuming the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (!controller.signal.aborted) {
        setActionError('The download could not start. Open the PDF below to save a copy.');
      }
    } finally {
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  function retry() {
    setPdf(null);
    setLoadingError(false);
    setPasswordProtected(false);
    setActionError('');
    setPage(1);
    setAttempt((value) => value + 1);
  }

  const failed = loadingError || passwordProtected;

  return (
    <div
      className="flex max-h-full min-w-0 flex-col overflow-hidden rounded-lg border border-gray-300 bg-gray-100 text-gray-900"
      ref={rootRef}
    >
      <CatalogToolbar
        canFullscreen={canFullscreen}
        downloadLabel={downloadLabel}
        downloading={downloading}
        firstPage={firstPage}
        fullscreen={fullscreen}
        goToPage={(value) => goToPage(value)}
        lastPage={lastPage}
        onDownload={() => downloadPdf()}
        onFullscreen={() => toggleFullscreen()}
        onNext={() => nextPage()}
        onPrevious={() => previousPage()}
        setZoom={setZoom}
        showDownload={showDownload}
        totalPages={totalPages}
        zoom={zoom}
      />
      {actionError !== '' && (
        <p className="border-b border-gray-300 bg-white p-3 text-sm" role="alert">
          {actionError}{' '}
          <a className="underline" href={pdfUrl} rel="noopener noreferrer" target="_blank">
            Open PDF
          </a>
        </p>
      )}
      <div
        aria-label={`${title} pages. Use left and right arrow keys to turn pages.`}
        className="min-h-80 min-w-0 flex-1 overflow-auto p-4 outline-offset-[-4px] md:p-6"
        onKeyDown={(event) => {
          // Do not intercept typing, link activation, or PDF form controls.
          if (
            event.target !== event.currentTarget ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          )
            return;

          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            previousPage();
          }

          if (event.key === 'ArrowRight') {
            event.preventDefault();
            nextPage();
          }

          if (event.key === 'Home') {
            event.preventDefault();
            goToPage(1);
          }

          if (event.key === 'End') {
            event.preventDefault();
            goToPage(totalPages);
          }
        }}
        ref={viewportRef}
        role="region"
        style={{ maxHeight: fullscreen ? undefined : '75svh' }}
        tabIndex={0}
      >
        {failed && (
          <div className="mx-auto max-w-md space-y-4 py-12 text-center" role="alert">
            <p>
              {passwordProtected
                ? 'This catalog is password protected. Open the PDF directly to unlock it.'
                : 'The catalog could not be loaded. Try again or open the PDF directly.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button className={buttonClass} onClick={() => retry()} type="button">
                <RotateCcw aria-hidden="true" size={16} />
                Try again
              </button>
              <a className={buttonClass} href={pdfUrl} rel="noopener noreferrer" target="_blank">
                Open PDF
              </a>
            </div>
          </div>
        )}
        <Document
          className={failed ? 'hidden' : 'mx-auto w-max min-w-full'}
          error={<span />}
          externalLinkRel="noopener noreferrer"
          externalLinkTarget="_blank"
          file={pdfUrl}
          key={attempt}
          loading={
            <p className="py-12 text-center" role="status">
              Loading catalog…
            </p>
          }
          onItemClick={({ pageNumber }) => {
            if (pageNumber) goToPage(getCatalogPageForDestination(pageNumber, twoUp));
          }}
          onLoadError={() => setLoadingError(true)}
          onLoadSuccess={setPdf}
          onPassword={() => setPasswordProtected(true)}
          onSourceError={() => setLoadingError(true)}
          options={documentOptions}
          suspense={false}
        >
          {width > 0 && !failed && (
            <div className="flex justify-center gap-1">
              {Array.from(
                { length: lastPage > firstPage ? 2 : 1 },
                (_, index) => firstPage + index,
              ).map((pageNumber) => (
                <CatalogPage
                  key={pageNumber}
                  pageNumber={pageNumber}
                  pdfUrl={pdfUrl}
                  twoUp={twoUp}
                  width={pageWidth}
                />
              ))}
            </div>
          )}
        </Document>
      </div>
      <p
        aria-live="polite"
        className="border-t border-gray-300 bg-white px-4 py-3 text-center text-xs text-gray-600"
      >
        {totalPages
          ? `Page${lastPage > firstPage ? 's' : ''} ${firstPage}${lastPage > firstPage ? `–${lastPage}` : ''} of ${totalPages}`
          : 'Digital catalog'}
      </p>
    </div>
  );
}
