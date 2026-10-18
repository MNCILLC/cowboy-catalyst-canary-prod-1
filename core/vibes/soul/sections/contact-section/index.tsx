import { Mail, MapPin, Phone } from 'lucide-react';
import { ReactNode } from 'react';

import { SectionLayout } from '@/vibes/soul/sections/section-layout';

export interface ContactSectionProps {
  className?: string;
  eyebrow?: string;
  heading: string;
  emailDescription?: string;
  phoneDescription?: string;
  mapLabel: string;
  contact?: { email: string; phone: string; address: string } | null;
  children: ReactNode;
}

export function ContactSection({
  className,
  eyebrow,
  heading,
  emailDescription,
  phoneDescription,
  mapLabel,
  contact,
  children,
}: ContactSectionProps) {
  return (
    <SectionLayout className={className}>
      <div className="grid items-start gap-10 @3xl:grid-cols-2 @3xl:gap-12 @5xl:gap-20">
        <div>
          {Boolean(eyebrow) && (
            <p className="mb-5 text-sm font-semibold uppercase tracking-wider text-primary">
              {eyebrow}
            </p>
          )}
          <h2 className="max-w-xl font-heading text-3xl font-medium leading-tight @xl:text-4xl @5xl:text-5xl">
            {heading}
          </h2>
          <div className="mt-8 space-y-7 @3xl:mt-12">
            {Boolean(contact?.email) && (
              <div className="flex items-start gap-4">
                <Mail aria-hidden="true" className="mt-1 shrink-0 text-primary" size={26} />
                <div className="min-w-0">
                  <a
                    className="break-words text-lg font-medium underline-offset-4 hover:underline"
                    href={`mailto:${contact?.email}`}
                  >
                    {contact?.email}
                  </a>
                  {Boolean(emailDescription) && (
                    <p className="mt-1 text-contrast-500">{emailDescription}</p>
                  )}
                </div>
              </div>
            )}
            {Boolean(contact?.phone) && (
              <div className="flex items-start gap-4">
                <Phone aria-hidden="true" className="mt-1 shrink-0 text-primary" size={26} />
                <div>
                  <a
                    className="text-lg font-medium underline-offset-4 hover:underline"
                    href={`tel:${contact?.phone.replace(/[^+\d]/g, '')}`}
                  >
                    {contact?.phone}
                  </a>
                  {Boolean(phoneDescription) && (
                    <p className="mt-1 text-contrast-500">{phoneDescription}</p>
                  )}
                </div>
              </div>
            )}
            {Boolean(contact?.address) && (
              <div className="flex items-start gap-4">
                <MapPin aria-hidden="true" className="mt-1 shrink-0 text-primary" size={26} />
                <div>
                  <a
                    className="text-lg font-medium underline-offset-4 hover:underline"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact?.address ?? '')}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {mapLabel}
                  </a>
                  <p className="mt-1 whitespace-pre-line text-contrast-500">{contact?.address}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-contrast-200 bg-background p-6 @xl:p-8 @5xl:p-10 [&_textarea]:min-h-32">
          {children}
        </div>
      </div>
    </SectionLayout>
  );
}
