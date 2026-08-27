import { Color, Group } from '@makeswift/runtime/controls';

import { hsl } from '~/lib/makeswift/utils/color';

import { colors } from '../base-colors';

const colorGroup = (
  label: string,
  defaults: {
    text: string;
    discountText: string;
  },
) =>
  Group({
    label,
    preferredLayout: Group.Layout.Inline,
    props: {
      text: Color({ label: 'Text', defaultValue: defaults.text }),
      discountText: Color({ label: 'Discount text', defaultValue: defaults.discountText }),
    },
  });

export const price = Group({
  label: 'Price label',
  preferredLayout: Group.Layout.Popover,
  props: {
    light: colorGroup('Light', {
      text: hsl(colors.foreground),
      discountText: '#ff0000',
    }),
    dark: colorGroup('Dark', {
      text: hsl(colors.background),
      discountText: '#ff0000',
    }),
  },
});
