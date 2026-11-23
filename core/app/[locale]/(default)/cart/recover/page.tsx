import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SignInSection } from '@/vibes/soul/sections/sign-in-section';
import { warehousePreviewEnabled } from '~/lib/warehouse/config';

import { login } from '../../(auth)/login/_actions/login';

const action = login.bind(null, { redirectTo: '/cart', recoverCart: true });

export default async function RecoverCart() {
  if (!warehousePreviewEnabled()) notFound();

  const t = await getTranslations('Auth.Login');
  const cart = await getTranslations('Cart');

  return (
    <SignInSection
      action={action}
      emailLabel={t('email')}
      forgotPasswordHref="/login/forgot-password"
      forgotPasswordLabel={t('forgotPassword')}
      passwordLabel={t('password')}
      submitLabel={t('cta')}
      title={cart('signInToRecover')}
    />
  );
}
