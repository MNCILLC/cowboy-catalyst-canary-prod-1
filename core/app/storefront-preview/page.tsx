import { Input } from '@/vibes/soul/form/input';
import { Button } from '@/vibes/soul/primitives/button';
import { getPreviewConfig, safePreviewReturnPath } from '~/lib/preview-access';

interface Props {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}

export default async function StorefrontPreviewPage({ searchParams }: Props) {
  const params = await searchParams;
  const { configured } = getPreviewConfig();
  const invalid = params.error === 'invalid';

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <section
        aria-labelledby="preview-title"
        className="w-full max-w-md rounded-2xl border border-contrast-200 bg-background p-8 shadow-sm sm:p-10"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-contrast-500">
          Private preview
        </p>
        <h1 className="mb-4 text-3xl font-semibold tracking-tight" id="preview-title">
          Welcome to our storefront
        </h1>
        <p className="mb-8 text-base text-contrast-500">
          {configured
            ? 'We’re getting ready to launch. Enter your access code to take a look around.'
            : 'Preview access is temporarily unavailable. Please check back soon.'}
        </p>
        {configured && (
          <form action="/api/storefront-preview" className="space-y-5" method="post">
            <input name="returnTo" type="hidden" value={safePreviewReturnPath(params.returnTo)} />
            <label className="block text-sm font-medium" htmlFor="preview-code">
              Access code
            </label>
            <Input
              aria-invalid={invalid}
              autoComplete="current-password"
              errors={invalid ? ['That access code is incorrect. Please try again.'] : undefined}
              id="preview-code"
              maxLength={512}
              name="code"
              required
              type="password"
            />
            <Button className="w-full" type="submit" variant="secondary">
              Enter storefront
            </Button>
            <p className="text-sm text-contrast-500">
              Access is remembered on this browser for seven days.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
