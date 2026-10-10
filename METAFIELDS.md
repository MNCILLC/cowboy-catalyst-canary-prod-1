# Product filter metafields

This document describes the custom product filter metafields consumed by this
storefront. Examples illustrate the required formats; they are not an inventory
of the store's current values.

## Namespaces and keys

Store-level metafields in `custom_site` define available filter options. Product-level
metafields in `custom_product` hold each product's actual attributes. Both namespaces
use underscores.

| Store key (`custom_site`) | Product key (`custom_product`) | Product value format | Unit |
| --- | --- | --- | --- |
| `color_filters` | `colors` | JSON array of strings | — |
| `effect_filters` | `effects` | JSON array of strings | — |
| `firing_pattern_filters` | `firing_patterns` | JSON array of strings | — |
| `caliber_filters` | `caliber` | JSON number | mm |
| `performance_height_filters` | `performance_height` | JSON number | ft |
| `duration_filters` | `duration` | JSON number | seconds |
| `ignition_type_filters` | `ignition_types` | JSON array of strings | — |

BigCommerce's metafield `value` is a text field. Put the JSON content described below
inside that field. When sending an API request, serialize that content as a string
in the request body's `value` property.

## Store filter options

Every store filter value is a JSON array of objects. Each object requires:

- `label`: a nonblank string shown to shoppers.
- `value`: a nonblank string identifying the option. Keep it unique within the list.

For example, the contents of `custom_site.effect_filters` could be:

```json
[
  { "label": "Brocade", "value": "brocade" },
  { "label": "Willow", "value": "willow" }
]
```

Use the same structure for `firing_pattern_filters` and `ignition_type_filters`.
Use stable option values without commas: selected values are split on commas in
filter URLs. Labels and values are preserved as supplied; the parser does not
automatically trim or lowercase them.

Malformed JSON or a top-level value other than an array produces no options.
Entries without valid labels and values are skipped. Duplicate option values are
skipped after the first accepted entry. Options retain their array order.

### Color options

`custom_site.color_filters` supports an optional `hex_value` for each color swatch:

```json
[
  { "label": "Gold", "value": "gold", "hex_value": "#FFD700" },
  { "label": "Silver", "value": "silver", "hex_value": "#C0C0C0" }
]
```

`color_value` is also accepted. If both properties contain valid hex codes,
`hex_value` takes precedence. Accepted codes start with `#` and contain 3, 4, 6, or
8 hexadecimal digits. A missing or invalid color code does not remove the option;
it leaves the option without a swatch color.

### Numeric range options

`caliber_filters`, `performance_height_filters`, and `duration_filters` use `label`
and `value` plus numeric bounds. For example, `custom_site.duration_filters`:

```json
[
  { "label": "0–30 seconds", "value": "0-30", "min": 0, "max": 30 },
  { "label": "Over 30 seconds", "value": "over-30", "min": 30.01, "max": null }
]
```

- `min` must be a finite, nonnegative number.
- `max` must be a finite number greater than or equal to `min`, or `null` for no upper limit.
- Both bounds are inclusive. Overlapping ranges can match the same product.
- Bounds use the product field's units from the table above.
- Choose boundaries appropriate to the precision of your product data. The example
  above assumes durations recorded to at most two decimal places.

The range's `value` identifies the filter option; products store their actual
number, not that identifier. An option with valid `label` and `value` but missing
or invalid bounds can still appear in the navigation, but cannot match products.

## Product attribute values

### List attributes

Store `colors`, `effects`, `firing_patterns`, and `ignition_types` as JSON arrays
of strings, even when a product has only one value:

| Product metafield | Example contents of its `value` field |
| --- | --- |
| `custom_product.colors` | `["gold","silver"]` |
| `custom_product.effects` | `["brocade","willow"]` |
| `custom_product.firing_patterns` | `["straight","fan"]` |
| `custom_product.ignition_types` | `["fuse"]` |

Each string must exactly match the corresponding store option's `value`, including
capitalization and whitespace. Use the option identifier, not its display label.
For example, an option with `"label": "Gold"` and `"value": "gold"` matches
`["gold"]`, not `["Gold"]`.

`Gold, Silver`, `"gold"`, and arrays of option objects are not valid product list
formats. An empty array (`[]`) represents no values. Missing or malformed values
cannot satisfy a selection for that attribute; non-string array entries are ignored.

### Numeric attributes

Store `caliber`, `performance_height`, and `duration` as a single finite,
nonnegative JSON number:

| Product metafield | Example contents of its `value` field |
| --- | --- |
| `custom_product.caliber` | `30` |
| `custom_product.performance_height` | `150` |
| `custom_product.duration` | `45` |

Decimals are supported. Do not include units, array brackets, or embedded quotes:
use `30`, not `30 mm`, `[30]`, or `"30"`. Missing or invalid numbers cannot match
a selected numeric range.

These partial API payloads illustrate the outer string serialization:

```json
{ "namespace": "custom_product", "key": "colors", "value": "[\"gold\",\"silver\"]" }
```

```json
{ "namespace": "custom_product", "key": "caliber", "value": "30" }
```

## Filter visibility and matching

- Set `ENABLE_CUSTOM_PRODUCT_FILTERS=true` to enable custom filters in the left navigation.
- There is no separate store metafield selecting which filter groups appear.
- Each supported group appears when its store metafield contains at least one valid
  option. A missing field, malformed list, or empty array (`[]`) omits that group.
- The group order is defined in code: Color, Effect, Firing Pattern, Caliber,
  Performance Height, Duration, Ignition Type. Adding an arbitrary store metafield
  does not add a new filter group.
- Custom options are loaded from the store lists; their visibility is not restricted
  to values present on products in the current category or search results.
- Multiple selected values within a group use OR matching. Different selected
  groups use AND matching.
- Native filters, such as price and brand, come separately from BigCommerce's
  faceted-search response.

Changing a store option list also affects consumers that use it for product
attribute labels; it is not solely a navigation visibility setting.

## Access and caching

Product attributes are read through Storefront GraphQL and must be
storefront-readable. Store filter lists are fetched server-side through the
Management API using `BIGCOMMERCE_STORE_HASH` and `BIGCOMMERCE_ACCESS_TOKEN`.
The token must have access to read the store metafields.

The store option fetch uses a 300-second revalidation interval, so changes may
not appear immediately. Keep the access token in server environment configuration.

## Google Sheets conversion

If cell `A1` contains `Gold, Silver`, this formula produces `["gold","silver"]`:

```excel
="["&TEXTJOIN(",",TRUE,ARRAYFORMULA(CHAR(34)&LOWER(TRIM(SPLIT(A1,",")))&CHAR(34)))&"]"
```

Use this for simple comma-separated identifiers without embedded quotation marks
or backslashes. It trims spaces and lowercases each entry. Lowercasing is correct
only when the store option values are lowercase; remove the `LOWER()` wrapper if
capitalization must be preserved. The formula does not translate display labels
into identifiers, so labels that differ from option values need an explicit mapping.

For blank cells, use this variant to output an empty array:

```excel
=IF(TRIM(A1)="","[]","["&TEXTJOIN(",",TRUE,ARRAYFORMULA(CHAR(34)&LOWER(TRIM(SPLIT(A1,",")))&CHAR(34)))&"]")
```

## Importing with the custom Metafield Manager app

These instructions apply to the app in
`/Users/kylehurt/dev/bc-apps/metafield-manager`.

### Prepare the CSV

Use a UTF-8 `.csv` file with **one metafield per row**. A product with all seven
attributes needs seven rows with the same product ID. Each file may contain at
most **500 data rows** and **2 MB**; split larger imports into batches.

| Column | Required | What to enter |
| --- | --- | --- |
| `product_id` | Yes | The positive numeric BigCommerce product ID. Matching uses this ID, not SKU or metafield ID. |
| `namespace` | Yes | `custom_product` for these product attributes. |
| `key` | Yes | One of the seven product keys listed above, such as `colors`. |
| `value` | Yes | The exact stored content: a JSON string array or a number as described above. |
| `permission_set` | No | For new storefront attributes, explicitly use `read_and_sf_access` or `write_and_sf_access`. |
| `description` | No | An optional description, up to 255 characters. |
| `action` | No | `create`, `update`, `upsert`, or `delete`; blank uses the selected Import mode. |
| `product_name`, `product_sku` | No | Informational columns accepted from exports; ignored for matching and writes. |

Headers must match these names. Unknown or duplicate headers are rejected, as
are duplicate `product_id` / `namespace` / `key` combinations within a file.
Namespace and key allow up to 64 characters each; value allows up to 65,535.

Blank or omitted `permission_set` and `description` preserve existing settings
on updates. New fields without an explicit permission use the app's configured
store default, which must allow storefront access for these attributes.
`read_and_sf_access` permits storefront reads while other apps see the field as
read-only; `write_and_sf_access` also permits other apps to edit it. Only the owning
app can change an existing field's permissions. If another app owns a field,
preserve its permissions and resolve any access error through the owning app.

The importer preserves value strings; it does not convert comma-separated colors
or validate this storefront's JSON schema. The app's **Download sample CSV**
currently contains `Red, Blue` as its example colors value. Replace that with a
JSON array such as `["red","blue"]` before using it for this storefront.

### Example file

Replace `123` with the actual product ID and use identifiers from your store's
filter options. This example leaves `action` out so the chosen Import mode applies:

```csv
product_id,namespace,key,value,permission_set
123,custom_product,colors,"[""gold"",""silver""]",read_and_sf_access
123,custom_product,effects,"[""brocade"",""willow""]",read_and_sf_access
123,custom_product,firing_patterns,"[""straight"",""fan""]",read_and_sf_access
123,custom_product,ignition_types,"[""fuse""]",read_and_sf_access
123,custom_product,caliber,30,read_and_sf_access
123,custom_product,performance_height,150,read_and_sf_access
123,custom_product,duration,45,read_and_sf_access
```

In Google Sheets, enter `["gold","silver"]` directly in the `value` cell, or use
the formula above. Export the sheet as CSV; its CSV writer handles the doubled
quotes shown in the raw file example. Do not manually double the quotes inside
the spreadsheet cell or paste API-style backslash escaping into it.

### Upload, preview, and import

1. Open the custom Metafield Manager app for the correct store and select
   **Products → Import CSV**. If editing existing data, **Products → Export CSV**
   can provide a starting file with IDs and existing values. That export includes
   all visible product metafields across namespaces regardless of search filters;
   retain only the rows you intend to import.
2. Use **Choose CSV file** or drag one CSV onto the upload area. Correct any file
   validation errors before proceeding.
3. Select **Import mode** using the behavior table below. Check any per-row
   `action` values because they override this selection.
4. Click **Preview import**. Preview reads data without changing it. Check product
   names, IDs, old/new values, permissions, and proposed actions. Resolve every
   preview error before importing.
5. If the preview includes updates, click **Download backup**. The app requires
   this before applying updates or deletions. Keep the JSON file; it preserves
   original values and permissions for recovery through the product editor or API.
6. Click **Import N rows** and keep the page open until it finishes. Writes happen
   one row at a time. **Stop after current row** pauses the run; the import button
   resumes remaining rows while the page stays open.
7. Review the results and click **Download results CSV** before navigating away
   or reloading. Results are retained only while the page is open.
8. Inspect an imported product's fields and confirm its filter selections work
   on the storefront, allowing for caching. A successful import means the string
   was saved; matching still depends on the formats and option values above.

| Import mode | If the field exists | If the field is missing |
| --- | --- | --- |
| Create only (default) | Skip it unchanged. | Create it. |
| Update only | Update it; skip if already identical. | Report an error. |
| Create or update | Update it; skip if already identical. | Create it. |

For mixed existing and new attributes, choose **Create or update**. Updates replace
the complete value; importing `["gold"]` replaces an existing `["gold","silver"]`
array rather than merging with it.

### Empty values and resolving import errors

- To clear a list attribute, import `[]`. A blank `value` is rejected unless the
  row explicitly has `action=delete`. For an unknown numeric attribute, omit its
  row when creating data; use deletion to remove an existing value. `0` is an
  actual number, not an empty-value marker.
- Deleting a field requires `action=delete`, the downloaded backup, and the app's
  deletion confirmation. The value is ignored for deletion and may be blank.
  A missing deletion target is skipped. Fields omitted from the file are not deleted.
- Multiple existing fields with the same namespace/key must be resolved in the
  product editor. Read-only fields cannot be updated by this app.
- If a field changes after preview or the preview expires (after two hours),
  review the current data and preview again before importing.
- Use **Preview failed rows again** to retry failures without repeating successful
  rows. An **unknown** write outcome pauses the run: inspect that product before
  starting a fresh preview because the write may have completed.

The workflow and limits are based on the app's
[README](../../bc-apps/metafield-manager/README.md),
[CSV parser](../../bc-apps/metafield-manager/src/lib/metafields/import-csv.ts), and
[import screen](../../bc-apps/metafield-manager/src/components/metafields/product-import.tsx).
These links assume the repositories retain their current sibling workspace layout.

## Implementation references

- [Field mappings, parsers, and matching](core/lib/product-metafield-filters.ts)
- [Store option loading and visibility](core/client/queries/get-metafield-filters.ts)
- [Custom filter feature flag](core/lib/custom-product-filters.ts)
- [Custom and native filter composition](core/data-transformers/facets-transformer.ts)
- [Product metafield queries](core/client/queries/get-metafield-filtered-products.ts)
- [Parsing and matching tests](core/lib/product-metafield-filters.test.mts)

For the separate professional-use metafields, see [Pro Use](core/docs/pro-use.md).
