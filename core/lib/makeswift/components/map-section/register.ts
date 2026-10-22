import { Number, Style, TextInput } from '@makeswift/runtime/controls';

import { runtime } from '~/lib/makeswift/runtime';

import { MSMapSection } from './client';

runtime.registerComponent(MSMapSection, {
  type: 'sections-map',
  label: 'Sections / Map Section',
  icon: 'image',
  props: {
    className: Style(),
    addressOverride: TextInput({
      label: 'Address override',
      description: 'Leave blank to use the store’s BigCommerce shipping-origin address.',
      defaultValue: '',
    }),
    title: TextInput({ label: 'Accessible map title', defaultValue: 'Store location' }),
    height: Number({
      label: 'Map height',
      defaultValue: 400,
      min: 200,
      max: 1000,
      step: 10,
      suffix: 'px',
    }),
    zoom: Number({ label: 'Zoom', defaultValue: 13, min: 1, max: 20, step: 1 }),
  },
});
