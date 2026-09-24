'use client';

import { clsx } from 'clsx';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressCycle, setProgressCycle] = useState(0);
  const [userPaused, setUserPaused] = useState(!autoplayEnabled);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: multipleImages, duration: reducedMotion ? 0 : 25 },
    [
      Autoplay({
        delay: 5000,
        active: multipleImages,
        defaultInteraction: false,
      }),
    ],
  );
  const shouldPlay = multipleImages && !reducedMotion && !userPaused && !paused;

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

    const onTimerSet = () => {
      setIsPlaying(true);
      setProgressCycle((value) => value + 1);
    };
    const onTimerStopped = () => setIsPlaying(false);

    emblaApi.on('autoplay:timerset', onTimerSet).on('autoplay:timerstopped', onTimerStopped);

    const syncPlayback = () => {
      const autoplay = emblaApi.plugins().autoplay;

      if (shouldPlay) autoplay.play();
      else autoplay.stop();

      setIsPlaying(autoplay.isPlaying());
    };

    syncPlayback();
    emblaApi.on('reinit', syncPlayback);

    return () => {
      emblaApi.off('reinit', syncPlayback);
      emblaApi.off('autoplay:timerset', onTimerSet).off('autoplay:timerstopped', onTimerStopped);
      emblaApi.plugins().autoplay.stop();
    };
  }, [emblaApi, shouldPlay]);

  return (
    <div
      aria-label={t('imageCarousel', { name: product.title })}
      aria-roledescription="carousel"
      className="group/carousel -mx-4 min-w-0"
      role="region"
    >
      <div className="relative">
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
          <>
            <div className="pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity duration-500 ease-in-out group-hover/carousel:pointer-events-auto group-hover/carousel:opacity-100 group-has-[:focus-visible]/carousel:pointer-events-auto group-has-[:focus-visible]/carousel:opacity-100">
              <Button
                aria-label={t('previousImage')}
                className="!bg-white !text-black opacity-50 after:hidden"
                onClick={() => emblaApi?.goToPrev()}
                shape="circle"
                size="x-small"
                variant="tertiary"
              >
                <ChevronLeft aria-hidden="true" size={16} />
              </Button>
            </div>
            <div className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity duration-500 ease-in-out group-hover/carousel:pointer-events-auto group-hover/carousel:opacity-100 group-has-[:focus-visible]/carousel:pointer-events-auto group-has-[:focus-visible]/carousel:opacity-100">
              <Button
                aria-label={t('nextImage')}
                className="!bg-white !text-black opacity-50 after:hidden"
                onClick={() => emblaApi?.goToNext()}
                shape="circle"
                size="x-small"
                variant="tertiary"
              >
                <ChevronRight aria-hidden="true" size={16} />
              </Button>
            </div>
            {!reducedMotion && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-500 ease-in-out group-hover/carousel:pointer-events-auto group-hover/carousel:opacity-100 group-has-[:focus-visible]/carousel:pointer-events-auto group-has-[:focus-visible]/carousel:opacity-100">
                <Button
                  aria-label={userPaused ? t('playSlideshow') : t('pauseSlideshow')}
                  className="!bg-white !text-black opacity-90 after:hidden"
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
              </div>
            )}
          </>
        )}
      </div>
      {multipleImages && (
        <div className="flex items-center justify-center gap-3 px-4">
          <div className="flex min-w-0 max-w-60 flex-1 items-center gap-2">
            {images.map((image, index) => (
              <button
                aria-current={index === selected ? 'true' : undefined}
                aria-label={t('imagePosition', {
                  current: String(index + 1),
                  total: String(images.length),
                })}
                className="min-w-0 flex-1 rounded px-0.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                key={image.src}
                onClick={() => {
                  emblaApi?.goTo(index);
                  emblaApi?.plugins().autoplay.reset();
                }}
                type="button"
              >
                <span className="relative block h-0.5 overflow-hidden bg-white/30">
                  <span
                    className={clsx(
                      'absolute inset-0 bg-white',
                      index === selected ? 'opacity-100' : 'opacity-0',
                      index === selected &&
                        isPlaying &&
                        'ease-linear animate-in slide-in-from-left fill-mode-forwards',
                    )}
                    key={progressCycle}
                    style={{ animationDuration: '5000ms' }}
                  />
                </span>
              </button>
            ))}
          </div>
          <span aria-live={isPlaying ? 'off' : 'polite'} className="sr-only">
            {t('imagePosition', { current: String(selected + 1), total: String(images.length) })}
          </span>
        </div>
      )}
    </div>
  );
}
