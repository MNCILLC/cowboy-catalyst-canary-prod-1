import { Checkbox, Image, Select, Style, TextArea, TextInput } from '@makeswift/runtime/controls';

import { DigitalCatalog } from '@/vibes/soul/sections/digital-catalog';
import { runtime } from '~/lib/makeswift/runtime';

runtime.registerComponent(DigitalCatalog, {
  type: 'section-digital-catalog',
  label: 'Sections / Digital Catalog',
  icon: 'carousel',
  props: {
    className: Style(),
    pdfFile: Image({
      label: 'PDF file',
      description:
        'Choose or upload a PDF in the file library. The selected file takes priority over the fallback URL.',
      format: Image.Format.URL,
    }),
    pdfUrl: TextInput({
      label: 'PDF URL (fallback)',
      description:
        'Optional fallback when no library file is selected. Use a public PDF URL or /catalogs/catalog.pdf. External hosts must allow CORS.',
    }),
    title: TextInput({ label: 'Title', defaultValue: 'Digital catalog' }),
    description: TextArea({ label: 'Description' }),
    pageLayout: Select({
      label: 'Page layout',
      options: [
        { value: 'spread', label: 'Two-page spread (single page on mobile)' },
        { value: 'single', label: 'Single page' },
      ],
      defaultValue: 'spread',
    }),
    showDownload: Checkbox({ label: 'Show PDF download', defaultValue: true }),
    downloadLabel: TextInput({ label: 'Download button label', defaultValue: 'Download PDF' }),
    downloadFilename: TextInput({ label: 'Download filename', defaultValue: 'catalog.pdf' }),
  },
});
