import 'server-only';

export const isCustomProductFilteringEnabled = process.env.ENABLE_CUSTOM_PRODUCT_FILTERS === 'true';
