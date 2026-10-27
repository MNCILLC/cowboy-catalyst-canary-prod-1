import type { Metadata } from 'next';
import { PropsWithChildren } from 'react';

import '../../globals.css';

export const metadata: Metadata = {
  title: 'Storefront preview',
  robots: { index: false, follow: false },
};

// Keep the gate independent of the localized layout and its catalog/API requests.
export default function PreviewLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
