import {
  Checkbox,
  Group,
  Image,
  Link,
  List,
  Number,
  Select,
  Style,
  TextArea,
  TextInput,
} from '@makeswift/runtime/controls';

import { runtime } from '~/lib/makeswift/runtime';

import { MSSlideshow } from './client';

runtime.registerComponent(MSSlideshow, {
  type: 'section-slideshow',
  label: 'Sections / Slideshow MNCI',
  icon: 'carousel',
  props: {
    className: Style(),
    slides: List({
      label: 'Slides',
      type: Group({
        props: {
          title: TextInput({ label: 'Title', defaultValue: 'Slide title' }),
          showDescription: Checkbox({ label: 'Show description', defaultValue: true }),
          description: TextArea({ label: 'Description', defaultValue: 'Slide description' }),
          imageSrc: Image(),
          imageAlt: TextInput({ label: 'Image alt', defaultValue: 'Slide image' }),
          imageAlign: Select({
            label: 'Image alignment',
            options: [
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
            ],
            defaultValue: 'center',
          }),
          showButton: Checkbox({ label: 'Show button', defaultValue: true }),
          buttonText: TextInput({ label: 'Button text', defaultValue: 'Shop all' }),
          buttonLink: Link({ label: 'Button link' }),
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
        },
      }),
      getItemLabel(slide) {
        return slide?.title || 'Slide title';
      },
    }),
    autoplay: Checkbox({ label: 'Autoplay', defaultValue: true }),
    interval: Number({ label: 'Duration', defaultValue: 5, suffix: 's' }),
    height: TextInput({ label: 'Height', defaultValue: '80vh' }),
    minHeight: TextInput({ label: 'Min Height' }),
    aspectRatio: TextInput({ label: 'Aspect Ratio' }),
  },
});
