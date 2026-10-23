export const wholesaleLoginText =
  process.env.NEXT_PUBLIC_WHOLESALE_LOGIN_TEXT?.trim() || 'Login for Wholesale Prices';

export const requiresWholesaleLogin = (enabled: string | undefined, isAuthenticated: boolean) =>
  enabled === 'true' && !isAuthenticated;

// Strip prices before catalog data crosses a server/client boundary.
export function hideWholesalePrices<
  T extends {
    pricesIncludingTax: unknown;
    pricesExcludingTax: unknown;
    showCartAction?: boolean;
  },
>(product: T, requiresLogin: boolean) {
  return requiresLogin
    ? {
        ...product,
        pricesIncludingTax: null,
        pricesExcludingTax: null,
        showCartAction: false,
        pricingRequiresLogin: true,
      }
    : { ...product, pricingRequiresLogin: false };
}

export function hideWholesaleCardPrices<T extends { price?: unknown; canAddToCart?: boolean }>(
  product: T,
  requiresLogin: boolean,
) {
  return requiresLogin
    ? {
        ...product,
        price: { type: 'login' as const },
        canAddToCart: false,
        pricingRequiresLogin: true,
      }
    : { ...product, pricingRequiresLogin: false };
}
