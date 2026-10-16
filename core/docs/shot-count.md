# Shot count

Set the product metafield `custom_product.shot_count` to a JSON number such as
`30`. The metafield value is text containing that number, not a JSON string
(`"30"`) or an array (`[30]`). Give the metafield storefront read access.
Missing, malformed, negative, and non-finite values are omitted.

The attribute displays as **Shot Count: 30** in the enhanced PDP specifications
and alongside other PLP attributes when **Show attributes** is enabled. It uses
the existing `ENABLE_ENHANCED_PRODUCT_ATTRIBUTES` and
`ENABLE_PRODUCT_CARD_ATTRIBUTES` feature settings. Display does not require
configured filter ranges.

## Range definitions

Set the store metafield `custom_site.shot_count_filters` to a JSON array of
options. The following ranges are examples only; configure the desired ranges
in BigCommerce:

```json
[
  { "label": "1–25 shots", "value": "1-25", "min": 1, "max": 25 },
  { "label": "26–50 shots", "value": "26-50", "min": 26, "max": 50 },
  { "label": "51+ shots", "value": "51-plus", "min": 51, "max": null }
]
```

`label` is the visible option text and `value` is its unique URL value. Bounds
are inclusive; `max: null` means no upper limit. Minimums must be finite and
nonnegative; numeric maximums must be finite and at least the minimum. Invalid
or missing bounds cannot match products. Ranges are read from store metadata,
not inferred from labels or URL values.

With `ENABLE_CUSTOM_PRODUCT_FILTERS=true`, the **Shot Count** filter appears on
category, brand, and search listings once options are configured. The URL
parameter is `mf_shot_count`, for example `?mf_shot_count=1-25,26-50`. Multiple
selected ranges use OR; shot count combines with other filter groups using AND.
Products without a valid shot count do not match a selected range.

The store and product metadata use the existing fetch cache, normally up to
five minutes for anonymous requests. No product values or store range definitions
are created automatically by enabling this feature.
