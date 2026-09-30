'use client';

import purify from 'dompurify';
import { useEffect, useState } from 'react';

// Keep server rendering and the first client render identical. Only insert HTML after
// purify has sanitized it in the browser; plain text remains readable without JS.
export function HeroHtml({ value, inline = false }: { value: string; inline?: boolean }) {
  const [sanitized, setSanitized] = useState<{ source: string; html: string; inline: boolean }>();

  useEffect(() => {
    setSanitized({
      source: value,
      inline,
      html: purify.sanitize(value, {
        ALLOWED_TAGS: inline
          ? ['span', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup', 'br']
          : [
              'p',
              'div',
              'span',
              'strong',
              'b',
              'em',
              'i',
              'u',
              's',
              'small',
              'sub',
              'sup',
              'br',
              'ul',
              'ol',
              'li',
              'blockquote',
              'a',
              'h1',
              'h2',
              'h3',
              'h4',
              'h5',
              'h6',
            ],
        ALLOWED_ATTR: ['class', 'style', 'href', 'title'],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
      }),
    });
  }, [value, inline]);

  const Tag = inline ? 'span' : 'div';

  if (sanitized?.source !== value || sanitized.inline !== inline) {
    return <Tag>{value.replace(/<[^>]*>/g, '')}</Tag>;
  }

  return <Tag dangerouslySetInnerHTML={{ __html: sanitized.html }} />;
}
