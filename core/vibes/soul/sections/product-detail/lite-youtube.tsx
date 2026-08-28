'use client';

// lite-youtube-embed is a tiny, dependency-free custom element that renders a
// YouTube facade (poster + play button) and only injects the real iframe on
// click — the standard "third-party facade" pattern. The CSS styles the element.
import 'lite-youtube-embed/src/lite-yt-embed.css';

import { type CSSProperties, useEffect } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'lite-youtube': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        videoid: string;
        playlabel?: string;
        params?: string;
      };
    }
  }
}

export interface LiteYouTubeProps {
  videoId: string;
  /** Visually-hidden label for the play button (accessibility). */
  playLabel: string;
  className?: string;
  style?: CSSProperties;
}

export function LiteYouTube({ videoId, playLabel, className, style }: LiteYouTubeProps) {
  // Register the custom element after React hydrates the server-rendered markup.
  // Its connectedCallback mutates the element, so registering it during module
  // evaluation can change the DOM before hydration finishes.
  useEffect(() => {
    void import('lite-youtube-embed');
  }, []);

  return (
    <lite-youtube
      className={className}
      params="rel=0"
      playlabel={playLabel}
      style={style}
      videoid={videoId}
    />
  );
}
