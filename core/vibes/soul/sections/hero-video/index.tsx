'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { HeroControls } from './controls';
import { HeroSlide, HeroVideoSlide } from './slide';

interface Props {
  className?: string;
  videoUrl?: string;
  aspectRatio?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  slides?: HeroVideoSlide[];
  autoplay?: boolean;
  duration?: number;
}

function parseAspectRatio(value: string): number | undefined {
  const parts = value.trim().split(/[:/]/);

  if (parts.length > 2 || parts.some((part) => !/^\d*\.?\d+$/.test(part.trim()))) return;

  const width = Number(parts[0]);
  const height = parts.length === 2 ? Number(parts[1]) : 1;
  const ratio = width / height;

  return width > 0 && height > 0 && Number.isFinite(ratio) ? ratio : undefined;
}

export function HeroVideo({
  className,
  videoUrl = '',
  aspectRatio = '',
  overlayColor = '#000000',
  overlayOpacity = 40,
  slides = [],
  autoplay = true,
  duration = 5,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [viewport, setViewport] = useState<{ width: number; left: number }>();
  const [failedSource, setFailedSource] = useState<string>();
  const [selected, setSelected] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [slidePlayback, setSlidePlayback] = useState<boolean>();
  const [videoPlayback, setVideoPlayback] = useState<boolean>();
  const [videoPlaying, setVideoPlaying] = useState(false);
  const source = /^(https?:\/\/|\/[^/])/.test(videoUrl.trim()) ? videoUrl.trim() : '';
  const activeIndex = slides.length > 0 ? selected % slides.length : 0;
  const slide = slides[activeIndex];
  const slidesPlaying = (slidePlayback ?? (autoplay && !reducedMotion)) && slides.length > 1;
  const videoShouldPlay = (videoPlayback ?? !reducedMotion) && pageVisible;
  const interval = Math.max(1, Number.isFinite(duration) ? duration : 5) * 1000;
  const ratioOverride = parseAspectRatio(aspectRatio);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(query.matches);
    const updateVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    const measure = () => {
      if (!containerRef.current) return;

      // Use clientWidth to exclude the scrollbar, and offset from the actual container
      // position so full bleed also works inside padded or off-center Makeswift boxes.
      const { left } = containerRef.current.getBoundingClientRect();
      const width = document.documentElement.clientWidth;

      setViewport((previous) =>
        previous?.left === left && previous.width === width ? previous : { width, left },
      );
    };
    const observer = new ResizeObserver(measure);

    updateMotion();
    updateVisibility();
    measure();
    observer.observe(document.documentElement);
    if (containerRef.current) observer.observe(containerRef.current);
    query.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      query.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => setSlidePlayback(undefined), [autoplay]);

  useEffect(() => {
    if (!slidesPlaying || hovered || !pageVisible) return;

    const timeout = window.setTimeout(
      () => setSelected((current) => (current + 1) % slides.length),
      interval,
    );

    return () => window.clearTimeout(timeout);
  }, [slidesPlaying, hovered, pageVisible, interval, selected, slides.length]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    if (videoShouldPlay) {
      // Browsers may reject autoplay. The visible video control permits a manual retry.
      void video.play().catch(() => setVideoPlaying(false));
    } else {
      video.pause();
    }
  }, [source, videoShouldPlay]);

  return (
    <div className={clsx('w-full', className)} ref={containerRef}>
      <section
        aria-label="Hero video"
        aria-roledescription={slides.length > 1 ? 'carousel' : undefined}
        className="relative isolate overflow-hidden bg-black text-white @container"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: viewport?.width ?? '100%',
          marginLeft: viewport ? -viewport.left : 0,
          aspectRatio: source === '' ? (ratioOverride ?? 16 / 9) : ratioOverride,
        }}
      >
        {source !== '' && (
          <video
            aria-hidden="true"
            className={clsx(
              'pointer-events-none block w-full max-w-none object-cover',
              ratioOverride === undefined ? 'h-auto' : 'absolute inset-0 h-full',
            )}
            key={source}
            loop
            muted
            onError={() => setFailedSource(source)}
            onLoadedMetadata={() => setFailedSource(undefined)}
            onPause={() => setVideoPlaying(false)}
            onPlay={() => setVideoPlaying(true)}
            playsInline
            preload="metadata"
            ref={videoRef}
            src={source}
            // In native mode the in-flow video sizes the section, even when metadata
            // loaded before hydration. The fallback applies only until it has a ratio.
            style={{ aspectRatio: 'auto 16 / 9' }}
            tabIndex={-1}
          />
        )}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: overlayColor,
            opacity:
              Math.min(100, Math.max(0, Number.isFinite(overlayOpacity) ? overlayOpacity : 40)) /
              100,
          }}
        />
        {slide && (
          <div
            aria-atomic="true"
            aria-live={slidesPlaying ? 'off' : 'polite'}
            className="absolute inset-x-0 bottom-16 top-0 overflow-y-auto"
            onFocusCapture={() => setSlidePlayback(false)}
          >
            <HeroSlide count={slides.length} index={activeIndex} key={activeIndex} slide={slide} />
          </div>
        )}
        <HeroControls
          activeIndex={activeIndex}
          count={slides.length}
          hasVideo={source !== '' && failedSource !== source}
          onSelect={(index) => {
            setSelected(index);
            setSlidePlayback(false);
          }}
          onToggleSlides={() => setSlidePlayback(!slidesPlaying)}
          onToggleVideo={() => {
            const video = videoRef.current;

            setVideoPlayback(!videoPlaying);
            if (videoPlaying) video?.pause();
            else if (video) void video.play().catch(() => setVideoPlaying(false));
          }}
          slidesPlaying={slidesPlaying}
          videoPlaying={videoPlaying}
        />
      </section>
    </div>
  );
}
