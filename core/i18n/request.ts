import deepmerge from 'deepmerge';
import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, locales } from './locales';

// The language to fall back to if the requested message string is not available.
const fallbackLocale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  // API routes do not pass through the locale proxy. Use the store default when absent.
  const locale = (await requestLocale) ?? defaultLocale;

  if (!locale || !locales.includes(locale)) {
    notFound();
  }

  if (locale === fallbackLocale) {
    return {
      locale,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
      messages: (await import(`../messages/${locale}.json`)).default,
    };
  }

  return {
    locale,
    messages: deepmerge(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
      (await import(`../messages/${fallbackLocale}.json`)).default,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access
      (await import(`../messages/${locale}.json`)).default,
    ),
  };
});
