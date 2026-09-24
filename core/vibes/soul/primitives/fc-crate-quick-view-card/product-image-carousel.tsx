'use client';

import Autoplay from 'embla-carousel-autoplay';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/vibes/soul/primitives/button';
import type { Product, ProductCardProps } from '@/vibes/soul/primitives/product-card';
import { Image } from '~/components/image';
import { Link } from '~/components/link';

interface Props extends Pick<ProductCardProps, 'imagePriority' | 'imageSizes'> {
  product: Product;
  paused?: boolean;
}

export function ProductImageCarousel({
  product,
  imagePriority,
  imageSizes,
  paused = false,
}: Props) {
  const t = useTranslations('Components.ProductCard');
  // Keep the catalog thumbnail first, without showing it twice in the gallery.
  const images = [...(product.image ? [product.image] : []), ...(product.images ?? [])].filter(
    (image, index, all) => all.findIndex((candidate) => candidate.src === image.src) === index,
  );
  const multipleImages = images.length > 1;
  const autoplayEnabled = process.env.NEXT_PUBLIC_FCCRATE_IMAGE_AUTOPLAY === 'true';
  const [selected, setSelected] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: multipleImages, duration: reducedMotion ? 0 : 25 },
    [Autoplay({ delay: 5000, active: autoplayEnabled && multipleImages })],
  );
  const shouldPlay =
    autoplayEnabled &&
    multipleImages &&
    !reducedMotion &&
    !userPaused &&
    !paused &&
    !hovered &&
    !focused;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);

    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!emblaApi) return;

    const sync = () => setSelected(emblaApi.selectedSnap());

    sync();
    emblaApi.on('select', sync).on('reinit', sync);

    return () => {
      emblaApi.off('select', sync).off('reinit', sync);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    const syncPlayback = () => {
      const autoplay = emblaApi.plugins().autoplay;

      if (shouldPlay) autoplay.play();
      else autoplay.stop();
    };

    syncPlayback();
    emblaApi.on('reinit', syncPlayback);

    return () => {
      emblaApi.off('reinit', syncPlayback);
      emblaApi.plugins().autoplay.stop();
    };
  }, [emblaApi, shouldPlay]);

  return (
    <div
      aria-label={t('imageCarousel', { name: product.title })}
      aria-roledescription="carousel"
      className="-mx-4 min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onFocus={() => setFocused(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="region"
    >
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex touch-pan-y items-start">
          {images.length > 0 ? (
            images.map((image, index) => (
              <div
                aria-label={t('imagePosition', {
                  current: String(index + 1),
                  total: String(images.length),
                })}
                aria-roledescription="slide"
                className="min-w-0 flex-[0_0_100%]"
                key={image.src}
                role="group"
              >
                <Link
                  aria-label={product.title}
                  className="block w-full"
                  href={product.href}
                  tabIndex={-1}
                >
                  <Image
                    alt={image.alt}
                    className="block h-auto w-full"
                    height={1024}
                    preload={index === 0 && imagePriority}
                    sizes={imageSizes}
                    src={image.src}
                    width={1024}
                  />
                </Link>
              </div>
            ))
          ) : (
            <div className="flex aspect-square w-full items-center justify-center break-words p-4 text-center text-xl opacity-50">
              {product.title}
            </div>
          )}
        </div>
      </div>
      {multipleImages && (
        <div className="mt-2 flex items-center justify-center gap-3 px-4">
          <Button
            aria-label={t('previousImage')}
            onClick={() => emblaApi?.goToPrev()}
            shape="circle"
            size="x-small"
            variant="tertiary"
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </Button>
          <span aria-live={shouldPlay ? 'off' : 'polite'} className="text-xs tabular-nums">
            {t('imagePosition', { current: String(selected + 1), total: String(images.length) })}
          </span>
          <Button
            aria-label={t('nextImage')}
            onClick={() => emblaApi?.goToNext()}
            shape="circle"
            size="x-small"
            variant="tertiary"
          >
            <ChevronRight aria-hidden="true" size={16} />
          </Button>
          {autoplayEnabled && !reducedMotion && (
            <Button
              aria-label={userPaused ? t('playSlideshow') : t('pauseSlideshow')}
              onClick={() => setUserPaused((value) => !value)}
              shape="circle"
              size="x-small"
              variant="tertiary"
            >
              {userPaused ? (
                <Play aria-hidden="true" size={16} />
              ) : (
                <Pause aria-hidden="true" size={16} />
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
