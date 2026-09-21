# Pro Use certification

Products with `custom_product.pro_use_only = true` display a **PRO** badge on
product cards and product detail pages. Missing/false values are unrestricted.
The value is a string; only `true` (case-insensitive, with surrounding whitespace
ignored) enables the flag. Product fields must be storefront-readable
(`read_and_sf_access` or `write_and_sf_access`) for GraphQL badges and UI gating.

A signed-in customer must have `custom_customer.is_pro_use = true` to purchase a
restricted product through Catalyst. Missing certification, false values, and
guests are not certified. `custom_customer.pro_use_cert_expiration` is read as
informational data only; it does not change eligibility. These customer fields
are admin-managed and are never accepted from a browser form or session update.

The replacement for restricted purchase controls is the store metafield
`custom_site.pro_use_message`. Plain text and sanitized HTML are supported,
including headings and links. Scripts and unsafe HTML are removed. The default
message when the field is missing or unavailable is `Pro Use Cert Required`.

## Enforcement

- A server-only Management API lookup checks current product restrictions before
  both create-cart and add-line-items mutations. Customer identity comes from the
  authenticated Storefront API session; certification is read through the
  Management API, so customer fields do not need storefront access.
- Supplied variant IDs must belong to the checked product. Current storefront
  actions use product IDs; alternate SKU-based mutation identities are rejected.
- Cart quantity/option edits check the existing line item and any supplied
  replacement product. Removing an item remains possible without certification.
- The Catalyst `/checkout` route rechecks all physical and digital products in
  the current/restored cart before requesting a BigCommerce checkout URL.
- Purchase checks use `cache: 'no-store'`; React memoization only deduplicates
  reads within a request. Failed lookups block the mutation or checkout handoff.
- PDP, product-list, comparison, and wishlist purchase controls use the same
  certification context. Makeswift cards, enhanced cards, show cards, navigation
  results, related products, and order-history product cards receive PRO badges.

**Hosted checkout limitation:** These checks protect Catalyst cart mutations and
checkout handoff. Standard BigCommerce hosted checkout does not run this repo's
code when placing an order. Already-open checkout sessions, customer changes in
hosted checkout, direct BigCommerce cart/checkout API calls, and certificate
revocation after handoff are not covered by a purchase-time server check.
Completing that requirement needs an additional BigCommerce-supported backend
validation integration or a separately designed checkout integration. A browser
script alone is not a reliable security boundary. This implementation must not be
represented as platform-wide purchase enforcement.

## Configuration

The deployment needs `BIGCOMMERCE_STORE_HASH` and `BIGCOMMERCE_ACCESS_TOKEN` as
server-only environment variables. Runtime access needs read permissions for
Products, Customers, and Information & Settings. The configuration script needs
write permissions for the resources it changes. Never use a `NEXT_PUBLIC_`
variable for the Management API token.

From `core/`, initialize the site message and designate a product:

```sh
node scripts/pro-use-metafields.mjs --setup --product-id 1603
```

`--setup` explicitly resets the message to `<h3>Pro Use Cert Required</h3>`.
The script upserts by namespace/key, verifies saved values, and is safe to rerun.
It loads environment values from `.env.local` or `../.env.local` without printing
credentials. Product/customer IDs are supplied as arguments rather than embedded
in application logic.

To certify an actual customer, replace `CUSTOMER_ID` with their numeric ID:

```sh
node scripts/pro-use-metafields.mjs --customer-id CUSTOMER_ID --certified true --expiration 2027-09-21
```

To revoke certification:

```sh
node scripts/pro-use-metafields.mjs --customer-id CUSTOMER_ID --certified false
```

Expiration is optional; omitting it preserves the existing field. BigCommerce
metafields are attached to individual customers, not globally declared fields.
No customer was certified or modified during the initial implementation because
no customer ID or expiration was supplied.

## Validation

From the repository root:

```sh
pnpm --filter @bigcommerce/catalyst-makeswift test:pro-use
pnpm --filter @bigcommerce/catalyst-makeswift typecheck
```

The tests cover missing/false flags, guest and certified access, mixed carts,
physical/digital line items, informational expiration, authenticated customer
identity, forged additions, mismatched variants/SKUs, invalid IDs, and Management API failures. Network and
session dependencies are mocked in server tests; they do not place orders or
change real customer certification.
