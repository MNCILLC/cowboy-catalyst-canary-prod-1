'use client';

import { clsx } from 'clsx';
import purify from 'dompurify';
import { useTranslations } from 'next-intl';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';

interface Props {
  children: ReactNode;
  label: string;
}

export function ProductDescription({ children, label }: Props) {
  const t = useTranslations('Product.ProductDetails');
  const descriptionId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [sanitizedHtml, setSanitizedHtml] = useState<{ source: string; html: string }>();

  useEffect(() => {
    if (typeof children !== 'string') return;

    setSanitizedHtml({
      source: children,
      html: purify.sanitize(children, { USE_PROFILES: { html: true } }),
    });
  }, [children]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;

    if (!viewport || !content) return;

    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(viewport).lineHeight);

      // Measure the full content so the toggle remains available while expanded.
      setOverflows(content.scrollHeight > Math.round(lineHeight * 15));
    };
    const observer = new ResizeObserver(measure);

    observer.observe(viewport);
    observer.observe(content);
    measure();

    return () => observer.disconnect();
  }, [children]);

  const toggleExpanded = () => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    setExpanded((value) => !value);
  };

  let renderedContent = children;

  if (typeof children === 'string') {
    // Match server rendering until the HTML can be sanitized in the browser.
    renderedContent =
      sanitizedHtml?.source === children ? (
        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml.html }} />
      ) : (
        <div>{children.replace(/<[^>]*>/g, '')}</div>
      );
  }

  return (
    <div className="border-t border-[var(--product-detail-border,hsl(var(--contrast-100)))] py-8">
      <div
        aria-label={label}
        className={clsx(
          'prose prose-sm max-w-none overflow-y-auto [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          !expanded && 'max-h-[15lh]',
        )}
        id={descriptionId}
        ref={viewportRef}
        role="region"
        tabIndex={overflows && !expanded ? 0 : undefined}
      >
        <div
          className="flow-root [&>div>*:first-child]:mt-0 [&>div>*:last-child]:mb-0"
          ref={contentRef}
        >
          {renderedContent}
        </div>
      </div>
      {overflows && (
        <button
          aria-controls={descriptionId}
          aria-expanded={expanded}
          className="mt-3 rounded text-sm text-[var(--product-detail-secondary-text,hsl(var(--contrast-500)))] underline underline-offset-4 hover:text-[var(--product-detail-primary-text,hsl(var(--foreground)))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={toggleExpanded}
          type="button"
        >
          {expanded ? t('hideFullDescription') : t('showFullDescription')}
        </button>
      )}
    </div>
  );
}
