export const sharingServices = [
  'facebook',
  'twitter',
  'linkedin',
  'pinterest',
  'email',
  'print',
] as const;

export type SharingService = (typeof sharingServices)[number];

export interface ShareContent {
  url: string;
  title: string;
  image?: string;
}

export function parseSharingServices(value?: string | null): SharingService[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) return [];

    return sharingServices.filter((service) => parsed.includes(service));
  } catch {
    return [];
  }
}

export function getSharingUrl(service: SharingService, { url, title, image }: ShareContent) {
  const params = new URLSearchParams();

  switch (service) {
    case 'facebook':
      params.set('u', url);

      return `https://www.facebook.com/sharer/sharer.php?${params}`;

    case 'twitter':
      params.set('url', url);
      params.set('text', title);

      return `https://x.com/intent/tweet?${params}`;

    case 'linkedin':
      params.set('url', url);

      return `https://www.linkedin.com/sharing/share-offsite/?${params}`;

    case 'pinterest':
      params.set('url', url);
      params.set('description', title);
      if (image) params.set('media', image);

      return `https://www.pinterest.com/pin/create/button/?${params}`;

    case 'email':
      return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;

    case 'print':
      return undefined;
  }
}
