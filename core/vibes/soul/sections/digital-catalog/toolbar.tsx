import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useId, useState } from 'react';

export const buttonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:cursor-not-allowed disabled:opacity-40';

interface ToolbarProps {
  firstPage: number;
  lastPage: number;
  totalPages: number;
  zoom: number;
  setZoom: Dispatch<SetStateAction<number>>;
  canFullscreen: boolean;
  fullscreen: boolean;
  showDownload: boolean;
  downloading: boolean;
  downloadLabel: string;
  goToPage: (page: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onFullscreen: () => Promise<void>;
  onDownload: () => Promise<void>;
}

export function CatalogToolbar({
  firstPage,
  lastPage,
  totalPages,
  zoom,
  setZoom,
  canFullscreen,
  fullscreen,
  showDownload,
  downloading,
  downloadLabel,
  goToPage,
  onPrevious,
  onNext,
  onFullscreen,
  onDownload,
}: ToolbarProps) {
  const pageInputId = useId();
  const [pageInput, setPageInput] = useState(String(firstPage));

  useEffect(() => setPageInput(String(firstPage)), [firstPage]);

  return (
    <div
      aria-label="Catalog controls"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-300 bg-white p-3"
    >
      <div className="flex items-center gap-2">
        <button
          aria-label="Previous page"
          className={buttonClass}
          disabled={!totalPages || firstPage <= 1}
          onClick={onPrevious}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <form
          className="flex items-center gap-2 text-sm"
          onSubmit={(event) => {
            event.preventDefault();

            const requested = Number(pageInput);

            if (Number.isFinite(requested)) goToPage(requested);

            setPageInput(String(firstPage));
          }}
        >
          <label htmlFor={pageInputId}>Page</label>
          <input
            aria-label="Page number"
            className="h-11 w-16 rounded-md border border-gray-300 bg-white text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"
            disabled={!totalPages}
            id={pageInputId}
            inputMode="numeric"
            max={totalPages || 1}
            min={1}
            onChange={(event) => setPageInput(event.target.value)}
            step={1}
            type="number"
            value={pageInput}
          />
          <span className="whitespace-nowrap">of {totalPages || '—'}</span>
          <button className="sr-only focus:not-sr-only" type="submit">
            Go to page
          </button>
        </form>
        <button
          aria-label="Next page"
          className={buttonClass}
          disabled={!totalPages || lastPage >= totalPages}
          onClick={onNext}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label="Zoom out"
          className={buttonClass}
          disabled={!totalPages || zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
          type="button"
        >
          <ZoomOut aria-hidden="true" size={18} />
        </button>
        <button
          aria-label="Reset zoom"
          className={buttonClass}
          disabled={!totalPages}
          onClick={() => setZoom(1)}
          type="button"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          className={buttonClass}
          disabled={!totalPages || zoom >= 2}
          onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
          type="button"
        >
          <ZoomIn aria-hidden="true" size={18} />
        </button>
        {canFullscreen && (
          <button
            aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
            className={buttonClass}
            onClick={onFullscreen}
            type="button"
          >
            {fullscreen ? (
              <Minimize aria-hidden="true" size={18} />
            ) : (
              <Maximize aria-hidden="true" size={18} />
            )}
          </button>
        )}
        {showDownload && (
          <button className={buttonClass} disabled={downloading} onClick={onDownload} type="button">
            <Download aria-hidden="true" size={18} />
            {downloading ? 'Downloading…' : downloadLabel || 'Download PDF'}
          </button>
        )}
      </div>
    </div>
  );
}
