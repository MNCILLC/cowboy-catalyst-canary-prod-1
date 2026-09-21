'use client';

import { Text } from '@makeswift/runtime/react/builtins/text';
import { clsx } from 'clsx';
import { ComponentPropsWithoutRef, forwardRef } from 'react';

type Props = ComponentPropsWithoutRef<typeof Text> & {
  borderStyle?: string;
  backgroundColor?: string;
};

// Match the built-in Text root and render its resolved rich-text content directly.
// Applying decorations on that same div preserves dimensions and inline editing.
export const MSText = forwardRef<HTMLDivElement, Props>(
  ({ backgroundColor, borderStyle, id, text, width, margin }, ref) => (
    <div className={clsx(width, margin, borderStyle)} id={id} ref={ref} style={{ backgroundColor }}>
      {text}
    </div>
  ),
);
