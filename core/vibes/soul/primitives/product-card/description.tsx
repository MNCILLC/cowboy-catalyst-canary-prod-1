'use client';

import { clsx } from 'clsx';
import purify from 'dompurify';
import { useEffect, useRef, useState } from 'react';

interface Props {
  description?: string;
  layout: 'grid' | 'list';
  colorScheme: 'light' | 'dark';
}

export function ProductCardDescription({ description, layout, colorScheme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState('');
  const [lines, setLines] = useState(0);

  useEffect(() => {
    if (layout !== 'list' || !description) return;

    const content = purify.sanitize(
      description.replace(/<\/(?:p|div|li|h[1-6]|tr|td|th)>|<br\b[^>]*>/gi, ' '),
      { ALLOWED_TAGS: [], ALLOWED_ATTR: [], RETURN_DOM: true },
    );

    setText(content.textContent?.replace(/\s+/g, ' ').trim() ?? '');

    const container = containerRef.current;
    const paragraph = textRef.current;

    if (!container || !paragraph) return;

    const updateLines = () => {
      const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight);
      const availableHeight = container.getBoundingClientRect().height;

      setLines(Math.max(0, Math.floor(availableHeight / lineHeight)));
    };
    const observer = new ResizeObserver(updateLines);

    observer.observe(container);
    updateLines();

    return () => observer.disconnect();
  }, [description, layout]);

  if (layout !== 'list' || !description) return null;

  return (
    <div
      className={clsx(
        // Size containment keeps the description out of the card's intrinsic height.
        'relative min-h-0 w-full flex-1 overflow-hidden text-sm leading-5 [contain:size]',
        {
          light: 'text-[var(--product-card-light-subtitle,hsl(var(--foreground)/75%))]',
          dark: 'text-[var(--product-card-dark-subtitle,hsl(var(--background)/75%))]',
        }[colorScheme],
      )}
      ref={containerRef}
    >
      <p
        className="absolute inset-x-0 top-0 m-0 overflow-hidden break-words leading-5 [-webkit-box-orient:vertical] [display:-webkit-box]"
        ref={textRef}
        style={{
          WebkitLineClamp: Math.max(1, lines),
          visibility: lines > 0 ? 'visible' : 'hidden',
        }}
      >
        {text}
      </p>
    </div>
  );
}
