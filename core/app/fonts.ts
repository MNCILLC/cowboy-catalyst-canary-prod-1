import { DM_Serif_Text, Inter, Roboto, Roboto_Condensed, Roboto_Mono } from 'next/font/google';

export const inter = Inter({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-family-inter',
});

export const dmSerifText = DM_Serif_Text({
  display: 'swap',
  subsets: ['latin'],
  weight: '400',
  variable: '--font-family-dm-serif-text',
});

export const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-family-roboto-mono',
});

export const roboto = Roboto({
  display: 'swap',
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-family-roboto',
});

export const robotoCondensed = Roboto_Condensed({
  display: 'swap',
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-family-roboto-condensed',
});

export const fonts = [inter, dmSerifText, robotoMono, roboto, robotoCondensed];
