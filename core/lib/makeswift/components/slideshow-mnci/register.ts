import {
  Checkbox,
  Color,
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
          slideName: TextInput({
            label: 'Slide name',
            description: 'Shown only in the editor slide list. Leave blank to use the slide title.',
          }),
          slideLink: Link({ label: 'Slide link' }),
          title: TextArea({ label: 'Title (HTML)', defaultValue: 'Slide title' }),
          showDescription: Checkbox({ label: 'Show description', defaultValue: true }),
          description: TextArea({ label: 'Description (HTML)', defaultValue: 'Slide description' }),
          contentVerticalAlign: Select({
            label: 'Content vertical alignment',
            options: [
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Center' },
              { value: 'bottom', label: 'Bottom' },
            ],
            defaultValue: 'bottom',
          }),
          shadingVerticalAlign: Select({
            label: 'Shading vertical alignment',
            options: [
              { value: 'top', label: 'Top' },
              { value: 'center', label: 'Center' },
              { value: 'bottom', label: 'Bottom' },
              { value: 'off', label: 'Off' },
            ],
            defaultValue: 'bottom',
          }),
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
          buttonWidth: TextInput({
            label: 'Button width (px)',
            description: 'Leave blank to use the default width and padding.',
          }),
          buttonHeight: TextInput({
            label: 'Button height (px)',
            description: 'Leave blank to use the default height and padding.',
          }),
          buttonFontSize: Number({ label: 'Button font size', suffix: 'px', min: 1 }),
          buttonFontColor: Color({
            label: 'Button font color',
            description: 'Leave unset to use the button style text color.',
          }),
          buttonBackgroundColor: Color({
            label: 'Button color',
            description: 'Leave unset to use the button style background and border colors.',
          }),
          buttonColor: Select({
            label: 'Button style',
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
        return slide?.slideName?.trim() || slide?.title || 'Slide title';
      },
    }),
    autoplay: Checkbox({ label: 'Autoplay', defaultValue: true }),
    interval: Number({ label: 'Duration', defaultValue: 5, suffix: 's' }),
    height: TextInput({ label: 'Height', defaultValue: '80vh' }),
    minHeight: TextInput({ label: 'Min Height' }),
    aspectRatio: TextInput({ label: 'Aspect Ratio' }),
  },
});
