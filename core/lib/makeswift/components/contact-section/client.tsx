'use client';

import { useLocale, useTranslations } from 'next-intl';
import { forwardRef, useState } from 'react';
import useSWR from 'swr';

import { DynamicForm } from '@/vibes/soul/form/dynamic-form';
import { Field } from '@/vibes/soul/form/dynamic-form/schema';
import { ContactSection, ContactSectionProps } from '@/vibes/soul/sections/contact-section';
import { loadContactSection, submitContactSection } from '~/lib/contact-section/actions';

interface Props extends Omit<ContactSectionProps, 'children' | 'contact'> {
  submitLabel?: string;
}

export const MSContactSection = forwardRef<HTMLDivElement, Props>(function MSContactSection(
  { className, submitLabel, ...props },
  ref,
) {
  const locale = useLocale();
  const t = useTranslations('ContactSection');
  const [sent, setSent] = useState(false);
  const { data, error, isLoading } = useSWR<Awaited<ReturnType<typeof loadContactSection>>, Error>(
    ['contact-section', locale],
    () => loadContactSection(),
  );
  const fields: Field[] = [
    { name: 'fullname', type: 'text', label: t('name'), placeholder: t('namePlaceholder') },
    {
      name: 'email',
      type: 'email',
      label: t('email'),
      placeholder: t('emailPlaceholder'),
      required: true,
    },
    {
      name: 'comments',
      type: 'textarea',
      label: t('message'),
      placeholder: t('messagePlaceholder'),
      required: true,
    },
  ];

  let formContent;

  if (isLoading) {
    formContent = (
      <p aria-busy="true" className="py-12 text-contrast-500" role="status">
        {t('loading')}
      </p>
    );
  } else if (error || !data?.pageId) {
    formContent = <p role="alert">{t('unavailable')}</p>;
  } else if (sent) {
    formContent = (
      <p className="py-12" role="status">
        {t('success')}
      </p>
    );
  } else {
    formContent = (
      <DynamicForm
        action={submitContactSection}
        fields={fields}
        onSuccess={() => setSent(true)}
        recaptchaSiteKey={data.recaptchaSiteKey ?? undefined}
        recaptchaSize="compact"
        submitLabel={submitLabel || t('send')}
      />
    );
  }

  return (
    <div className={className} ref={ref}>
      <ContactSection {...props} contact={data?.contact}>
        {formContent}
      </ContactSection>
    </div>
  );
});
