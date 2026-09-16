import { clsx } from 'clsx';
import { CSSProperties, MouseEventHandler } from 'react';

import { ButtonLink } from '@/vibes/soul/primitives/button-link';

import { HeroHtml } from './html';

export interface HeroVideoSlide {
  title?: string;
  subtitle?: string;
  description?: string;
  horizontalAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  showButton?: boolean;
  buttonText?: string;
  buttonTextColor?: string;
  buttonColor?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  buttonHexColor?: string;
  buttonLink?: { href?: string; target?: string; onClick?: MouseEventHandler };
  showSecondaryButton?: boolean;
  secondaryButtonText?: string;
  secondaryButtonTextColor?: string;
  secondaryButtonColor?: HeroVideoSlide['buttonColor'];
  secondaryButtonHexColor?: string;
  secondaryButtonLink?: HeroVideoSlide['buttonLink'];
}

function buttonStyle(hex: string, variant: string): CSSProperties | undefined {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return;

  const color =
    hex.length === 4
      ? `#${hex
          .slice(1)
          .split('')
          .map((digit) => digit + digit)
          .join('')}`
      : hex;
  const rgb = [1, 3, 5].map((start) => {
    const channel = parseInt(color.slice(start, start + 2), 16) / 255;

    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722;

  const variables: CSSProperties & Record<`--${string}`, string> = {
    [`--button-${variant}-background`]: color,
    [`--button-${variant}-border`]: color,
    [`--button-${variant}-background-hover`]: `color-mix(in srgb, ${color}, black 15%)`,
    [`--button-${variant}-text`]: luminance > 0.179 ? '#000000' : '#ffffff',
  };

  return variables;
}

function HeroSlideButton({
  show = false,
  text = '',
  textColor,
  variant = 'primary',
  hexColor = '',
  link,
}: {
  show?: boolean;
  text?: string;
  textColor?: string;
  variant?: HeroVideoSlide['buttonColor'];
  hexColor?: string;
  link?: HeroVideoSlide['buttonLink'];
}) {
  if (!show || !text) return null;

  return (
    <div className="mt-6">
      <ButtonLink
        href={link?.href ?? '#'}
        onClick={link?.onClick}
        prefetch="none"
        rel={link?.target === '_blank' ? 'noopener noreferrer' : undefined}
        style={{ ...buttonStyle(hexColor.trim(), variant), color: textColor }}
        target={link?.target}
        variant={variant}
      >
        <HeroHtml inline value={text} />
      </ButtonLink>
    </div>
  );
}

export function HeroSlide({
  slide,
  index,
  count,
}: {
  slide: HeroVideoSlide;
  index: number;
  count: number;
}) {
  return (
    <div
      aria-label={`${index + 1} of ${count}`}
      aria-roledescription="slide"
      className={clsx(
        'mx-auto flex min-h-full w-full max-w-screen-2xl flex-col px-6 py-6 @xl:px-10 @xl:py-10',
        {
          'justify-start': slide.verticalAlign === 'top',
          'justify-center': !slide.verticalAlign || slide.verticalAlign === 'center',
          'justify-end': slide.verticalAlign === 'bottom',
          'items-start text-left': slide.horizontalAlign === 'left',
          'items-center text-center': !slide.horizontalAlign || slide.horizontalAlign === 'center',
          'items-end text-right': slide.horizontalAlign === 'right',
        },
      )}
      role="group"
    >
      <div className="w-full max-w-3xl break-words motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in">
        {Boolean(slide.title) && (
          <div
            aria-level={1}
            className="font-[family-name:var(--font-family-heading)] text-3xl font-semibold leading-tight @xl:text-5xl @4xl:text-6xl"
            role="heading"
          >
            <HeroHtml value={slide.title ?? ''} />
          </div>
        )}
        {Boolean(slide.subtitle) && (
          <div className="mt-3 text-xl font-medium @xl:text-2xl">
            <HeroHtml value={slide.subtitle ?? ''} />
          </div>
        )}
        {Boolean(slide.description) && (
          <div className="mt-4 whitespace-pre-line text-base leading-relaxed @xl:text-lg [&_a]:underline [&_ol]:list-inside [&_ol]:list-decimal [&_ul]:list-inside [&_ul]:list-disc">
            <HeroHtml value={slide.description ?? ''} />
          </div>
        )}
        <HeroSlideButton
          hexColor={slide.buttonHexColor}
          link={slide.buttonLink}
          show={slide.showButton ?? true}
          text={slide.buttonText}
          textColor={slide.buttonTextColor}
          variant={slide.buttonColor}
        />
        <HeroSlideButton
          hexColor={slide.secondaryButtonHexColor}
          link={slide.secondaryButtonLink}
          show={slide.showSecondaryButton}
          text={slide.secondaryButtonText}
          textColor={slide.secondaryButtonTextColor}
          variant={slide.secondaryButtonColor ?? 'secondary'}
        />
      </div>
    </div>
  );
}
