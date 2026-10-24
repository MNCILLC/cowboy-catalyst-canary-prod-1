import 'server-only';

export const isCheckoutAuthenticationRequired =
  process.env.REQUIRE_AUTHENTICATION_FOR_CHECKOUT === 'true' ||
  process.env.HIDE_PRICES_WHEN_LOGGED_OUT === 'true';
