import { expect, test } from '~/tests/fixtures';
import { getTranslations } from '~/tests/lib/i18n';

test.use({ reuseCustomerSession: false });

test('Login and logout flows work as expected', async ({ page, customer }) => {
  const t = await getTranslations();

  await customer.login();
  await page.waitForURL('/account/orders/');
  await expect(
    page.getByRole('heading', { name: t('Account.Orders.title') }).first(),
  ).toBeVisible();

  await customer.logout();
  await expect(page.getByRole('heading', { name: t('Auth.Login.heading') })).toBeVisible();
});

test('Login with redirectTo query parameter works with a simple path', async ({
  page,
  customer,
}) => {
  const redirectTo = '/test-path/';

  await customer.login(redirectTo);
  await page.waitForURL(redirectTo);
});

test('Login with redirectTo query parameter works with a path containing query parameters', async ({
  page,
  customer,
}) => {
  const redirectTo = '/test-path/?param1=value1&param2=value2';

  await customer.login(redirectTo);
  await page.waitForURL(redirectTo);
});

test('Login with invalid credentials returns an error', async ({ page }) => {
  const t = await getTranslations('Auth.Login');

  await page.goto(`/login`);
  await page.getByLabel(t('email')).fill('invalid-email-testing@testing.com');
  await page.getByLabel(t('password')).fill('invalid-password');
  await page.getByRole('button', { name: t('cta') }).click();

  await expect(page.getByText(t('invalidCredentials'))).toBeVisible();
});

test.describe('Server-rendered login form', () => {
  test.use({ javaScriptEnabled: false });

  test('submits credentials in the POST body with JavaScript disabled', async ({ page }) => {
    const t = await getTranslations('Auth.Login');
    const email = 'shopper@example.invalid';
    const password = 'synthetic-login-fixture';

    await page.goto('/login?redirectTo=%2Fcart');

    const form = page.locator('form').filter({ has: page.getByLabel(t('password')) });

    await expect(form).toHaveAttribute('method', /^post$/i);
    await form.getByLabel(t('email')).fill(email);
    await form.getByLabel(t('password')).fill(password);

    // Observe the native submission without forwarding test credentials to a provider.
    await page.route(/\/login\/?(?:\?|$)/, (route) => route.fulfill({ status: 200, body: 'OK' }));

    const submitted = page.waitForRequest((candidate) => candidate.isNavigationRequest());

    await form.getByRole('button', { name: t('cta') }).click();

    const request = await submitted;
    const url = new URL(request.url());

    expect(request.method()).toBe('POST');
    expect(url.searchParams.has('email')).toBe(false);
    expect(url.searchParams.has('password')).toBe(false);
    expect(decodeURIComponent(url.href)).not.toContain(email);
    expect(decodeURIComponent(url.href)).not.toContain(password);
    expect(request.postData()).toContain(email);
    expect(request.postData()).toContain(password);
  });
});

test('Browsing to /login/ when already logged in redirects to /account/orders/', async ({
  page,
  customer,
}) => {
  const t = await getTranslations();
  const ordersHeader = t('Account.Orders.title');

  await customer.login();
  await page.waitForURL('/account/orders/');
  await expect(page.getByRole('heading', { name: ordersHeader, exact: true })).toBeVisible();

  await page.goto('/login/');
  await page.waitForURL('/account/orders/');
  await expect(page.getByRole('heading', { name: ordersHeader, exact: true })).toBeVisible();
});

test('JWT login works as expected and redirects to /account/orders/ by default', async ({
  page,
  customer,
}) => {
  const t = await getTranslations('Account.Orders');
  const { id } = await customer.getOrCreateTestCustomer();
  const jwt = await customer.generateLoginJwt(id);

  await page.goto(`/login/token/${jwt}`);
  await page.waitForURL('/account/orders/');
  await expect(page.getByRole('heading', { name: t('title'), exact: true })).toBeVisible();
});

test('JWT login redirects to the specified redirect_to value in the token payload', async ({
  page,
  customer,
}) => {
  const t = await getTranslations('Account.Addresses');
  const { id } = await customer.getOrCreateTestCustomer();
  const jwt = await customer.generateLoginJwt(id, '/account/addresses/');

  await page.goto(`/login/token/${jwt}`);
  await page.waitForURL('/account/addresses/');
  await expect(page.getByRole('heading', { name: t('title'), exact: true })).toBeVisible();
});

test('JWT login with an invalid/expired token shows an error message', async ({ page }) => {
  const t = await getTranslations('Auth.Login');

  const invalidJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  await page.goto(`/login/token/${invalidJwt}`);
  await page.waitForURL('/login/?error=InvalidToken');
  await expect(page.getByText(t('invalidToken'))).toBeVisible();
});

test('After invalid JWT login, manually logging in with invalid credentials will replace the error message displayed', async ({
  page,
}) => {
  const t = await getTranslations('Auth.Login');

  const invalidJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  await page.goto(`/login/token/${invalidJwt}`);
  await page.waitForURL('/login/?error=InvalidToken');
  await expect(page.getByText(t('invalidToken'))).toBeVisible();

  await page.getByLabel(t('email')).fill('invalid-email-testing@testing.com');
  await page.getByLabel(t('password')).fill('invalid-password');
  await page.getByRole('button', { name: t('cta') }).click();

  await page.waitForURL('/login/');
  await expect(page.getByText(t('invalidToken'))).not.toBeVisible();
  await expect(page.getByText(t('invalidCredentials'))).toBeVisible();
});
