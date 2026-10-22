'use server';

import { SubmissionResult } from '@conform-to/react';
import { parseWithZod } from '@conform-to/zod';
import { getTranslations } from 'next-intl/server';

import { DynamicFormActionArgs } from '@/vibes/soul/form/dynamic-form';
import { Field } from '@/vibes/soul/form/dynamic-form/schema';
import { client } from '~/client';
import { graphql } from '~/client/graphql';
import { assertRecaptchaTokenPresent, getRecaptchaFromForm } from '~/lib/recaptcha';

import { getContactSectionData } from './data';
import { contactSectionSchema } from './schema';

const SubmitContactSectionMutation = graphql(`
  mutation SubmitContactSectionMutation(
    $input: SubmitContactUsInput!
    $reCaptchaV2: ReCaptchaV2Input
  ) {
    submitContactUs(input: $input, reCaptchaV2: $reCaptchaV2) {
      errors {
        ... on Error {
          message
        }
      }
    }
  }
`);

export async function loadContactSection() {
  return getContactSectionData();
}

export async function submitContactSection(
  _args: DynamicFormActionArgs<Field>,
  _state: { lastResult: SubmissionResult | null },
  formData: FormData,
) {
  const t = await getTranslations('WebPages.ContactUs.Form');
  // Validate a fixed server-owned schema; never trust field definitions from the browser.
  const submission = parseWithZod(formData, { schema: contactSectionSchema });

  if (submission.status !== 'success') return { lastResult: submission.reply() };

  try {
    const { siteKey, token } = await getRecaptchaFromForm(formData);
    const validation = assertRecaptchaTokenPresent(siteKey, token, t('recaptchaRequired'));

    if (!validation.success) {
      return { lastResult: submission.reply({ formErrors: validation.formErrors }) };
    }

    // Resolve the recipient page on the server, in the current channel.
    const { pageId } = await getContactSectionData();

    if (!pageId) return { lastResult: submission.reply({ formErrors: [t('somethingWentWrong')] }) };

    const { data } = await client.fetch({
      document: SubmitContactSectionMutation,
      variables: {
        input: {
          pageEntityId: pageId,
          data: {
            fullName: submission.value.fullname,
            email: submission.value.email,
            comments: submission.value.comments,
          },
        },
        reCaptchaV2: validation.token ? { token: validation.token } : undefined,
      },
      fetchOptions: { cache: 'no-store' },
    });

    if (data.submitContactUs.errors.length > 0) {
      return { lastResult: submission.reply({ formErrors: [t('somethingWentWrong')] }) };
    }

    return { lastResult: submission.reply({ resetForm: true }), successMessage: t('success') };
  } catch {
    return { lastResult: submission.reply({ formErrors: [t('somethingWentWrong')] }) };
  }
}
