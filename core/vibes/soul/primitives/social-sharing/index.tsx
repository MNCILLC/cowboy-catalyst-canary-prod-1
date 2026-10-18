'use client';

import { SiFacebook, SiPinterest, SiX } from '@icons-pack/react-simple-icons';
import { Linkedin, Mail, Printer } from 'lucide-react';

import { getSharingUrl, ShareContent, SharingService } from '~/lib/social-sharing';

interface Props extends ShareContent {
  services: SharingService[];
  label: string;
  serviceLabels: Record<SharingService, string>;
}

const icons = {
  facebook: SiFacebook,
  twitter: SiX,
  linkedin: Linkedin,
  pinterest: SiPinterest,
  email: Mail,
  print: Printer,
};

export function SocialSharing({ services, label, serviceLabels, ...content }: Props) {
  if (services.length === 0) return null;

  const controlClass =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-contrast-200 text-foreground transition-colors hover:bg-contrast-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

  return (
    <div aria-label={label} className="flex flex-wrap items-center gap-2 print:hidden" role="group">
      <span className="mr-1 text-sm font-medium">{label}</span>
      {services.map((service) => {
        const Icon = icons[service];
        const title = serviceLabels[service];

        return service === 'print' ? (
          <button
            aria-label={title}
            className={controlClass}
            key={service}
            onClick={() => window.print()}
            title={title}
            type="button"
          >
            <Icon aria-hidden="true" size={18} />
          </button>
        ) : (
          <a
            aria-label={title}
            className={controlClass}
            href={getSharingUrl(service, content)}
            key={service}
            rel="noopener noreferrer"
            target={service === 'email' ? undefined : '_blank'}
            title={title}
          >
            <Icon aria-hidden="true" size={18} />
          </a>
        );
      })}
    </div>
  );
}
