import 'server-only';

export const isCheckoutAuthenticationRequired =
  process.env.REQUIRE_AUTHENTICATION_FOR_CHECKOUT === 'true';
