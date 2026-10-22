import { clsx } from 'clsx';

export interface MapSectionProps {
  className?: string;
  address: string;
  title: string;
  height?: number;
  zoom?: number;
}

export function MapSection({
  className,
  address,
  title,
  height = 400,
  zoom = 13,
}: MapSectionProps) {
  const params = new URLSearchParams({
    q: address,
    z: String(Math.min(20, Math.max(1, zoom))),
    output: 'embed',
  });

  return (
    <section
      aria-label={title}
      className={clsx('w-full overflow-hidden bg-contrast-100', className)}
    >
      <iframe
        allowFullScreen
        className="block w-full border-0"
        height={Math.min(1000, Math.max(200, height))}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={`https://www.google.com/maps?${params}`}
        title={`${title}: ${address}`}
      />
    </section>
  );
}
