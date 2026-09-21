import {
  Checkbox,
  Color,
  Group,
  Link,
  List,
  Number,
  Select,
  Style,
  TextArea,
  TextInput,
} from '@makeswift/runtime/controls';

import { HeroVideo } from '@/vibes/soul/sections/hero-video';
import { runtime } from '~/lib/makeswift/runtime';

runtime.registerComponent(HeroVideo, {
  type: 'section-hero-video',
  label: 'Sections / Hero Video',
  icon: 'video',
  props: {
    className: Style(),
    videoUrl: TextInput({
      label: 'Video URL',
      description: 'Upload an MP4 in Makeswift Files, then paste its file URL here.',
    }),
    aspectRatio: TextInput({
      label: 'Aspect ratio',
      description: 'Leave blank for the native video ratio. Accepts 16:9, 16/9, or 1.7778.',
    }),
    overlayColor: Color({ label: 'Overlay color', defaultValue: '#000000' }),
    overlayOpacity: Number({
      label: 'Overlay opacity',
      defaultValue: 40,
      min: 0,
      max: 100,
      step: 1,
      suffix: '%',
    }),
    slides: List({
      label: 'Slides',
      type: Group({
        props: {
          title: TextArea({ label: 'Title (text or HTML)', defaultValue: 'Slide title' }),
          subtitle: TextArea({ label: 'Subtitle (text or HTML)' }),
          description: TextArea({ label: 'Description (text or HTML)' }),
          horizontalAlign: Select({
            label: 'Horizontal text alignment',
            options: [
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ],
            defaultValue: 'center',
          }),
          verticalAlign: Select({
            label: 'Vertical text alignment',
            options: [
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Center' },
              { value: 'bottom', label: 'Bottom' },
            ],
            defaultValue: 'center',
          }),
          showButton: Checkbox({ label: 'Show button', defaultValue: true }),
          buttonText: TextArea({ label: 'Button text (text or HTML)', defaultValue: 'Learn more' }),
          buttonTextColor: Color({
            label: 'Button text color',
            description: 'Leave unset to use the theme or automatic contrast color.',
          }),
          buttonColor: Select({
            label: 'Button color',
            options: [
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
              { value: 'tertiary', label: 'Tertiary' },
              { value: 'ghost', label: 'Ghost' },
            ],
            defaultValue: 'primary',
          }),
          buttonHexColor: TextInput({
            label: 'Button hex color override',
            description:
              'Optional #RGB or #RRGGBB color. Leave blank to use the selected theme color.',
          }),
          buttonLink: Link({
            label: 'Button link',
            description:
              'Open page, Open URL, Compose email, Call phone, or Scroll to element. Use Open in a new tab for page and URL links.',
          }),
          showSecondaryButton: Checkbox({ label: 'Show secondary button', defaultValue: false }),
          secondaryButtonText: TextArea({
            label: 'Secondary button text (text or HTML)',
            defaultValue: 'Learn more',
          }),
          secondaryButtonTextColor: Color({
            label: 'Secondary button text color',
            description: 'Leave unset to use the theme or automatic contrast color.',
          }),
          secondaryButtonColor: Select({
            label: 'Secondary button color',
            options: [
              { value: 'primary', label: 'Primary' },
              { value: 'secondary', label: 'Secondary' },
              { value: 'tertiary', label: 'Tertiary' },
              { value: 'ghost', label: 'Ghost' },
            ],
            defaultValue: 'secondary',
          }),
          secondaryButtonHexColor: TextInput({
            label: 'Secondary button hex color override',
            description:
              'Optional #RGB or #RRGGBB color. Leave blank to use the selected theme color.',
          }),
          secondaryButtonLink: Link({
            label: 'Secondary button link',
            description:
              'Open page, Open URL, Compose email, Call phone, or Scroll to element. Use Open in a new tab for page and URL links.',
          }),
        },
      }),
      getItemLabel(slide) {
        return slide?.title.replace(/<[^>]*>/g, '').trim() || 'Slide';
      },
    }),
    autoplay: Checkbox({ label: 'Autoplay', defaultValue: true }),
    duration: Number({ label: 'Duration', defaultValue: 5, min: 1, step: 0.5, suffix: 's' }),
  },
});
