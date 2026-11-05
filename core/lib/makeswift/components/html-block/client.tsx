'use client';

import { forwardRef } from 'react';

interface Props {
  className?: string;
  html?: { value: string };
}

export const MSHTMLBlock = forwardRef<HTMLDivElement, Props>(function MSHTMLBlock(
  { className, html },
  ref,
) {
  // This is trusted, editor-authored HTML, rendered unchanged like a custom embed.
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html?.value ?? '' }} ref={ref} />
  );
});
