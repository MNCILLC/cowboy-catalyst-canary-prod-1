import { faker } from '@faker-js/faker';

import { expect, test } from '~/tests/fixtures';
import { getTranslations } from '~/tests/lib/i18n';
import { TAGS } from '~/tests/tags';

test('Registration works as expected', { tag: [TAGS.writesData] }, async ({ page, customer }) => {
  const t = await getTranslations();

  const email = faker.internet.email({ provider: 'example.com' });
  // Prefix is added to ensure that the password requirements are met
  const password = faker.internet.password({
    pattern: /[a-zA-Z0-9]/,
    prefix: '1At!',
    length: 10,
  });
  const phone = faker.phone.number({ style: 'national' });
  const streetAddress = faker.location.streetAddress();
  const city = faker.location.city();
  const state = faker.location.state();
  const postalCode = faker.location.zipCode();

  await page.goto('/register');
  await page.getByRole('heading', { name: t('Auth.Register.heading') }).waitFor();

  // TODO: Form fields when creating a new account need to be translated
  await page.getByLabel('First Name').fill(faker.person.firstName());
  await page.getByLabel('Last Name').fill(faker.person.lastName());
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  await page.getByLabel('Phone').fill(phone);
  await page.getByLabel('Address Line 1').fill(streetAddress);
  await page.getByLabel('Suburb/City').fill(city);
  await page.getByLabel('Zip/Postcode').fill(postalCode);
  await page.getByRole('combobox', { name: 'Country' }).click();
  await page.keyboard.type('United States');
  await page.keyboard.press('Enter');
  await page.getByRole('combobox', { name: 'State/Province' }).click();
  await page.getByRole('option', { name: state, exact: true }).click();

  // Click reCAPTCHA if enabled (uses test key — no challenge, always passes)
  const recaptchaFrame = page.frameLocator('iframe[title="reCAPTCHA"]');
  const recaptchaCheckbox = recaptchaFrame.locator('.recaptcha-checkbox-border');

  if (await recaptchaCheckbox.isVisible()) {
    await recaptchaCheckbox.click();
    await recaptchaFrame.locator('.recaptcha-checkbox-checked').waitFor();
  }

  await page.getByRole('button', { name: t('Auth.Register.cta') }).click();

  await expect(page).toHaveURL('/account/orders/');
  await expect(
    page.getByRole('heading', { name: t('Account.Orders.title'), exact: true }),
  ).toBeVisible();

  const { id } = await customer.getByEmail(email);

  // Ensure registered customer is cleaned up after the test
  await customer.delete(id);
});

test('Registration fails if email is already in use', async ({ page, customer }) => {
  const { email } = await customer.createNewCustomer();
  const t = await getTranslations('Auth.Register');

  // Prefix is added to ensure that the password requirements are met
  const password = faker.internet.password({
    pattern: /[a-zA-Z0-9]/,
    prefix: '1At!',
    length: 10,
  });
  const phone = faker.phone.number({ style: 'national' });
  const streetAddress = faker.location.streetAddress();
  const city = faker.location.city();
  const state = faker.location.state();
  const postalCode = faker.location.zipCode();

  await page.goto('/register');
  await page.getByRole('heading', { name: t('heading') }).waitFor();

  // TODO: Form fields when creating a new account need to be translated
  await page.getByLabel('First Name').fill(faker.person.firstName());
  await page.getByLabel('Last Name').fill(faker.person.lastName());
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  await page.getByLabel('Phone').fill(phone);
  await page.getByLabel('Address Line 1').fill(streetAddress);
  await page.getByLabel('Suburb/City').fill(city);
  await page.getByLabel('Zip/Postcode').fill(postalCode);
  await page.getByRole('combobox', { name: 'Country' }).click();
  await page.keyboard.type('United States');
  await page.keyboard.press('Enter');
  await page.getByRole('combobox', { name: 'State/Province' }).click();
  await page.getByRole('option', { name: state, exact: true }).click();

  // Click reCAPTCHA if enabled (uses test key — no challenge, always passes)
  const recaptchaFrame = page.frameLocator('iframe[title="reCAPTCHA"]');
  const recaptchaCheckbox = recaptchaFrame.locator('.recaptcha-checkbox-border');

  if (await recaptchaCheckbox.isVisible()) {
    await recaptchaCheckbox.click();
    await recaptchaFrame.locator('.recaptcha-checkbox-checked').waitFor();
  }

  await page.getByRole('button', { name: t('cta') }).click();

  await expect(page).not.toHaveURL('/account/orders/');

  // TODO: Error message needs to be translated
  await expect(page.getByText('The email address is already in use.')).toBeVisible();
});

test('Registration fails if reCAPTCHA is not completed', async ({ page }) => {
  const t = await getTranslations('Auth.Register');

  await page.goto('/register');
  await page.getByRole('heading', { name: t('heading') }).waitFor();

  const recaptchaFrame = page.frameLocator('iframe[title="reCAPTCHA"]');
  const recaptchaCheckbox = recaptchaFrame.locator('.recaptcha-checkbox-border');

  try {
    await recaptchaCheckbox.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    test.skip();
  }

  // Fill form but intentionally skip clicking reCAPTCHA
  await page.getByLabel('First Name').fill(faker.person.firstName());
  await page.getByLabel('Last Name').fill(faker.person.lastName());
  await page.getByLabel('Email Address').fill(faker.internet.email({ provider: 'example.com' }));

  const password = faker.internet.password({ pattern: /[a-zA-Z0-9]/, prefix: '1At!', length: 10 });

  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password').fill(password);
  await page.getByLabel('Phone').fill(faker.phone.number({ style: 'national' }));
  await page.getByLabel('Address Line 1').fill(faker.location.streetAddress());
  await page.getByLabel('Suburb/City').fill(faker.location.city());
  await page.getByLabel('Zip/Postcode').fill(faker.location.zipCode());
  await page.getByRole('combobox', { name: 'Country' }).click();
  await page.keyboard.type('United States');
  await page.keyboard.press('Enter');
  await page.getByRole('combobox', { name: 'State/Province' }).click();
  await page.getByRole('option', { name: faker.location.state(), exact: true }).click();

  await page.getByRole('button', { name: t('cta') }).click();

  await expect(page).not.toHaveURL('/account/orders/');
  await expect(page.getByText(t('recaptchaRequired'))).toBeVisible();
});

test('Registration state options follow the selected country', async ({ page }) => {
  await page.goto('/register');

  const country = page.getByRole('combobox', { name: 'Country', exact: true });
  const state = page.getByRole('combobox', { name: 'State/Province' });
  const stateValue = page.locator('input[name="stateOrProvince"]');

  await expect(state).toBeDisabled();
  await country.click();
  await page.getByRole('option', { name: 'United States', exact: true }).click();
  await state.click();
  await page.getByRole('option', { name: 'Missouri', exact: true }).click();
  await expect(stateValue).toHaveValue('Missouri');

  await country.click();
  await page.getByRole('option', { name: 'Canada', exact: true }).click();
  await expect(stateValue).toHaveValue('');
  await state.click();
  await expect(page.getByRole('option', { name: 'Missouri', exact: true })).toHaveCount(0);
  await page.getByRole('option', { name: 'Ontario', exact: true }).click();
  await expect(stateValue).toHaveValue('Ontario');
});
