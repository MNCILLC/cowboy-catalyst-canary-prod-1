import { Style, TextInput } from '@makeswift/runtime/controls';

import { runtime } from '~/lib/makeswift/runtime';

import { MSContactSection } from './client';

runtime.registerComponent(MSContactSection, {
  type: 'sections-contact',
  label: 'Sections / Contact Section',
  icon: 'form',
  props: {
    className: Style(),
    eyebrow: TextInput({ label: 'Eyebrow', defaultValue: 'Get in touch' }),
    heading: TextInput({
      label: 'Heading',
      defaultValue: 'Leave a message or just call us directly.',
    }),
    emailDescription: TextInput({
      label: 'Email description',
      defaultValue: 'Prefer to write? Send us an email.',
    }),
    phoneDescription: TextInput({
      label: 'Phone description',
      defaultValue: 'Give us a call. We’re happy to help.',
    }),
    mapLabel: TextInput({ label: 'Map link label', defaultValue: 'Show on the map' }),
    submitLabel: TextInput({ label: 'Send button label', defaultValue: 'Send' }),
  },
});
