import { type SyntheticEvent, useEffect, useRef, useState } from 'react';

function parseAspectRatio(value = ''): number {
  const [width = 0, height = 1] = value.split('/').map(Number);
  const ratio = width / height;

  return Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
}

// Keep the mobile dimensions untouched; desktop banners fit below the full site header.
export function useDesktopFit(imageSrc: string | undefined, aspectRatio: string | undefined) {
  const containerRef = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState<{ width: number; height: number }>();
  const [imageSize, setImageSize] = useState<{ src: string | undefined; ratio: number }>();

  useEffect(() => {
    const container = containerRef.current;

    if (!container) return;

    const desktop = window.matchMedia('(min-width: 1024px)');
    let header = document.querySelector<HTMLElement>('[data-site-header]');
    const measure = () => {
      if (!desktop.matches) {
        setBounds(undefined);

        return;
      }

      const width = container.clientWidth;
      const height = Math.max(
        0,
        window.innerHeight - (header?.getBoundingClientRect().height ?? 0),
      );

      setBounds((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    const headerObserver = new MutationObserver(() => {
      header = document.querySelector<HTMLElement>('[data-site-header]');
      if (!header) return;

      observer.observe(header);
      headerObserver.disconnect();
      measure();
    });

    observer.observe(container);
    if (header) observer.observe(header);
    else headerObserver.observe(document.body, { childList: true, subtree: true });
    desktop.addEventListener('change', measure);
    window.addEventListener('resize', measure);
    measure();

    return () => {
      observer.disconnect();
      headerObserver.disconnect();
      desktop.removeEventListener('change', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const onImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;

    if (naturalWidth > 0 && naturalHeight > 0) {
      setImageSize({ src: imageSrc, ratio: naturalWidth / naturalHeight });
    }
  };
  // Use a stable canvas based on the first image so advancing slides doesn't move the page.
  const ratio =
    imageSize && imageSize.src === imageSrc ? imageSize.ratio : parseAspectRatio(aspectRatio);
  const fittedHeight = bounds ? Math.min(bounds.height, bounds.width / ratio) : undefined;
  const desktopSize =
    fittedHeight === undefined ? undefined : { width: fittedHeight * ratio, height: fittedHeight };

  return { containerRef, desktopSize, onImageLoad };
}
