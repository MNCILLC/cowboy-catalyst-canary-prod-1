import { Slideshow } from '@/vibes/soul/sections/slideshow-mnci';

interface Slide {
  title: string;
  description: string;
  showDescription: boolean;
  imageSrc?: string;
  imageAlt: string;
  imageAlign: 'left' | 'center';
  showButton: boolean;
  buttonLink?: { href?: string; target?: string };
  buttonText: string;
  buttonColor: 'primary' | 'secondary' | 'tertiary' | 'ghost';
}

interface MSAccordionsProps {
  className: string;
  slides: Slide[];
  autoplay: boolean;
  interval: number;
  height?: string;
  minHeight?: string;
  aspectRatio?: string;
}

export function MSSlideshow({ className, slides, autoplay, interval, height, minHeight, aspectRatio }: MSAccordionsProps) {
  return (
    <Slideshow
      className={className}
      interval={interval * 1000}
      height={height}
      minHeight={minHeight}
      aspectRatio={aspectRatio}
      playOnInit={autoplay}
      slides={slides.map(
        ({
          title,
          description,
          showDescription,
          imageSrc,
          imageAlt,
          imageAlign,
          showButton,
          buttonLink,
          buttonText,
          buttonColor,
        }) => {
          return {
            title,
            description,
            showDescription,
            image: imageSrc ? { alt: imageAlt, src: imageSrc } : undefined,
            imageAlign: imageAlign,
            showCta: showButton,
            cta: { label: buttonText, href: buttonLink?.href ?? '#', variant: buttonColor },
          };
        },
      )}
    />
  );
}
