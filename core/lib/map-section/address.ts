interface OriginAddress {
  address1: string;
  address2: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  countryCode: string;
}

export function formatOriginAddress(address?: OriginAddress | null): string | null {
  if (!address?.address1.trim()) return null;

  return [
    address.address1,
    address.address2,
    address.city,
    [address.stateOrProvince, address.postalCode].filter(Boolean).join(' '),
    address.countryCode,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}
