export const PRO_USE_MESSAGE = 'Pro Use Cert Required';

export interface Metafield {
  key: string;
  value: string;
}

// Do not use Boolean(value): the string "false" is truthy.
export function isTrueMetafield(value?: string): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function getProUseCertification(fields: Metafield[]) {
  return {
    isCertified: isTrueMetafield(fields.find(({ key }) => key === 'is_pro_use')?.value),
    // Informational only; expiration does not grant or revoke certification.
    expiration: fields.find(({ key }) => key === 'pro_use_cert_expiration')?.value ?? null,
  };
}

export function isProUseProduct(product: {
  proUseMetafields?: { edges: Array<{ node: { value: string } }> | null };
}): boolean {
  return isTrueMetafield(product.proUseMetafields?.edges?.[0]?.node.value);
}

export class ProUseRequiredError extends Error {
  constructor() {
    super(PRO_USE_MESSAGE);
    this.name = 'ProUseRequiredError';
  }
}

export async function authorizeProUseProducts(
  productIds: number[],
  dependencies: {
    isProductRestricted: (id: number) => Promise<boolean>;
    getCertification: () => Promise<{ isCertified: boolean }>;
  },
): Promise<void> {
  const ids = [...new Set(productIds)];

  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Invalid product ID.');
  }

  const restricted = await Promise.all(ids.map(dependencies.isProductRestricted));

  if (restricted.some(Boolean) && !(await dependencies.getCertification()).isCertified) {
    throw new ProUseRequiredError();
  }
}
