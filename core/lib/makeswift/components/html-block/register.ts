import { Code, Style } from '@makeswift/runtime/controls';

import { runtime } from '~/lib/makeswift/runtime';

import { MSHTMLBlock } from './client';

runtime.registerComponent(MSHTMLBlock, {
  type: 'content-html-block',
  label: 'Content / HTML Block',
  props: {
    className: Style({ properties: [...Style.Default, Style.Border, Style.BorderRadius] }),
    html: Code({
      label: 'HTML',
      description: 'Enter or paste trusted HTML markup to render on the page.',
      defaultValue: '<p>Replace this with your HTML.</p>',
    }),
  },
});
