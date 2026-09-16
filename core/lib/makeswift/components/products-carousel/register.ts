import {
  Checkbox,
  Combobox,
  Group,
  List,
  Number,
  Select,
  Style,
  TextInput,
} from '@makeswift/runtime/controls';

import { runtime } from '~/lib/makeswift/runtime';

import { searchCategories } from '../../utils/search-categories';
import { searchProducts } from '../../utils/search-products';

import { MSProductsCarousel } from './client';

runtime.registerComponent(MSProductsCarousel, {
  type: 'primitive-products-carousel',
  label: 'Catalog / Products Carousel',
  icon: 'carousel',
  props: {
    className: Style(),
    collection: Select({
      label: 'Product collection',
      options: [
        { value: 'none', label: 'None (static only)' },
        { value: 'best-selling', label: 'Best selling' },
        { value: 'newest', label: 'Newest' },
        { value: 'featured', label: 'Featured' },
        { value: 'category', label: 'Category' },
      ],
      defaultValue: 'best-selling',
    }),
    categoryId: Combobox({
      label: 'Product category',
      description: 'Choose a category when Product collection is set to Category.',
      getOptions: searchCategories,
    }),
    limit: Number({
      label: 'Max products',
      description: 'Maximum total products, including additional products (1–50).',
      defaultValue: 12,
      min: 1,
      max: 50,
      step: 1,
    }),
    additionalProducts: List({
      label: 'Additional products',
      type: Group({
        label: 'Product',
        props: {
          title: TextInput({ label: 'Title', defaultValue: 'Product title' }),
          entityId: Combobox({
            label: 'Product',
            async getOptions(query) {
              const products = await searchProducts(query);

              return products.map((product) => ({
                id: product.entityId.toString(),
                label: product.name,
                value: product.entityId.toString(),
              }));
            },
          }),
        },
      }),
      getItemLabel(product) {
        return product?.title || 'Product';
      },
    }),
    aspectRatio: Select({
      label: 'Aspect ratio',
      options: [
        { value: '1:1', label: 'Square' },
        { value: '5:6', label: '5:6' },
        { value: '3:4', label: '3:4' },
      ],
      defaultValue: '5:6',
    }),
    colorScheme: Select({
      label: 'Text color scheme',
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      defaultValue: 'light',
    }),
    showScrollbar: Checkbox({
      label: 'Show scrollbar',
      defaultValue: true,
    }),
    showButtons: Checkbox({
      label: 'Show buttons',
      defaultValue: true,
    }),
    hideOverflow: Checkbox({
      label: 'Hide overflow',
      defaultValue: true,
    }),
    showWholesalePricingBanner: Checkbox({
      label: 'Show wholesale pricing banner',
      defaultValue: true,
    }),
  },
});
