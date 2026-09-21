'use client';

import { createContext, ReactNode, useContext } from 'react';

import { Stream, Streamable } from '@/vibes/soul/lib/streamable';
import { Badge } from '@/vibes/soul/primitives/badge';
import { HeroHtml } from '@/vibes/soul/sections/hero-video/html';

interface ProUseAccess {
  isCertified: boolean;
  message: string;
}

const defaultAccess: ProUseAccess = {
  isCertified: false,
  message: 'Pro Use Cert Required',
};
const ProUseContext = createContext<Streamable<ProUseAccess>>(defaultAccess);

export function ProUseProvider({
  value,
  children,
}: {
  value: Streamable<ProUseAccess>;
  children: ReactNode;
}) {
  return <ProUseContext.Provider value={value}>{children}</ProUseContext.Provider>;
}

export function ProUseMessage({ message }: { message: string }) {
  return (
    <div className="prose prose-sm relative z-20 whitespace-pre-line" role="status">
      <HeroHtml value={message} />
    </div>
  );
}

export function ProUseGate({
  restricted,
  children,
}: {
  restricted?: boolean;
  children: ReactNode;
}) {
  const access = useContext(ProUseContext);

  if (!restricted) return children;

  return (
    <Stream fallback={<ProUseMessage message={defaultAccess.message} />} value={access}>
      {({ isCertified, message }) => (isCertified ? children : <ProUseMessage message={message} />)}
    </Stream>
  );
}

export function ProUseCustomerBadge() {
  const access = useContext(ProUseContext);

  return (
    <Stream fallback={null} value={access}>
      {({ isCertified }) =>
        isCertified ? (
          <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <Badge className="px-1 py-0 text-[9px] font-semibold leading-3" shape="rounded">
              PRO
            </Badge>
            <span className="sr-only"> certified customer</span>
          </span>
        ) : null
      }
    </Stream>
  );
}
