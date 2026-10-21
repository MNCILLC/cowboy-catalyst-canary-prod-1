import { Stream, Streamable } from '@/vibes/soul/lib/streamable';

interface Banner {
  entityId: number;
  content: string;
  location: 'TOP' | 'BOTTOM';
}

interface Props {
  banners: Streamable<Banner[]>;
  location: Banner['location'];
}

export function ContentBanners({ banners, location }: Props) {
  return (
    <Stream fallback={null} value={banners}>
      {(items) =>
        items
          .filter((banner) => banner.location === location && banner.content.trim())
          .map((banner) => (
            <div
              className="bg-contrast-100 px-4 py-6 text-foreground @xl:px-6 @4xl:px-8"
              data-banner-id={banner.entityId}
              key={banner.entityId}
            >
              <div
                className="prose mx-auto max-w-screen-2xl prose-a:text-foreground [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_img]:h-auto [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: banner.content }}
              />
            </div>
          ))
      }
    </Stream>
  );
}
