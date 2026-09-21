import { clsx } from 'clsx';
import { Pause, Play } from 'lucide-react';

interface Props {
  count: number;
  activeIndex: number;
  slidesPlaying: boolean;
  hasVideo: boolean;
  videoPlaying: boolean;
  onSelect: (index: number) => void;
  onToggleSlides: () => void;
  onToggleVideo: () => void;
}

export function HeroControls({
  count,
  activeIndex,
  slidesPlaying,
  hasVideo,
  videoPlaying,
  onSelect,
  onToggleSlides,
  onToggleVideo,
}: Props) {
  const controlsClass =
    'flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-black/40 text-white hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

  return (
    <div className="absolute inset-x-0 bottom-3 mx-auto flex max-w-screen-2xl items-center gap-3 px-6 @xl:px-10">
      {count > 1 && (
        <>
          <div aria-label="Choose slide" className="flex min-w-0 gap-1 overflow-x-auto">
            {Array.from({ length: count }, (_, index) => (
              <button
                aria-current={index === activeIndex ? 'true' : undefined}
                aria-label={`Show slide ${index + 1}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                key={index}
                onClick={() => onSelect(index)}
                type="button"
              >
                <span
                  className={clsx(
                    'h-2 w-2 rounded-full bg-white',
                    index !== activeIndex && 'opacity-40',
                  )}
                />
              </button>
            ))}
          </div>
          <button
            aria-label={slidesPlaying ? 'Pause slides' : 'Play slides'}
            className={clsx(controlsClass, 'shrink-0')}
            onClick={onToggleSlides}
            type="button"
          >
            {slidesPlaying ? (
              <Pause aria-hidden="true" size={16} />
            ) : (
              <Play aria-hidden="true" size={16} />
            )}
          </button>
        </>
      )}
      {hasVideo && (
        <button
          aria-label={videoPlaying ? 'Pause background video' : 'Play background video'}
          className={clsx(controlsClass, 'ml-auto shrink-0')}
          onClick={onToggleVideo}
          type="button"
        >
          {videoPlaying ? (
            <Pause aria-hidden="true" size={16} />
          ) : (
            <Play aria-hidden="true" size={16} />
          )}
        </button>
      )}
    </div>
  );
}
