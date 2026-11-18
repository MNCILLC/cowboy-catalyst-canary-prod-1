# Local warehouse picker milestone

This feature is intentionally enabled only with `NODE_ENV=development` and
`WAREHOUSE_PREVIEW_ENABLED=true`. It does not activate hosted custom checkout.

Run from `core`: `node scripts/warehouse-dev.cjs`. This loads the existing local
environment and `.env.warehouse.example`, then starts port 3011 with a separate
`.next-warehouse-preview` build directory. Set `WAREHOUSE_ENV_FILE` to an absolute
path to use another store's warehouse configuration; use `WAREHOUSE_PREVIEW_PORT`
to change the port. Existing normal dev servers can remain running.

Launch `node poc/warehouse-preview.cjs` from the independent Open Checkout repo
(after running its `npm run dev` asset builder). Set `STOREFRONT_URL` if needed.
The launched Chrome browser is required for the isolated preview. Shop and sign
in normally; the cart's Preview checkout button passes the session cart to the
local checkout assets. Without that browser, the local checkout route returns
the preview handoff JSON instead of activating a hosted checkout. That response
contains a short-lived checkout URL: do not save or publish it.

## Behavior

The picker appears below the shared navigation on default-layout storefront
pages, including mobile. No warehouse is selected initially. A shopper may
browse, but must select a warehouse before adding items. An HTTP-only, same-site
cookie retains the selection for 30 days. Switching checks every physical cart
line first; failure preserves the cart and previous selection.

All normal cart creation/addition paths share the warehouse guard. Quantity
updates also validate the existing cart, excluding the replaced line. Checks
aggregate quantities across lines sharing the same product or variant inventory
pool. Catalog identities and fresh available-to-sell values come from server-only
management API reads. API failures, missing inventory, and untracked physical
products fail closed. Variant options must identify one variant. Digital items
do not consume warehouse stock. The checkout handoff rechecks the entire physical
cart and requires that its ID match the authenticated/anonymous session. Existing
login, Pro Use, loyalty, and minimum-order checks remain in place.

The local warehouse flow replaces the cart's legacy fulfillment selector and
shipping estimator. It suppresses origin-based inventory messages that would
mislabel Powell inventory. Native pickup or shipping is selected in checkout.
Existing Freight App preferences are not modified by this milestone.

## Independent checkout contract

The response protocol is `warehouse-preview-v2`. Its `warehouseCheckout` object
contains `version: 1`, `preview: true`, `cartId`, and a public warehouse object:
`id`, `label`, `pickupLabel`, `locationId`, `pickupMethodId`, `allowShipping`.
No Catalyst package import or management credential is required in checkout.
The isolated browser consumes the one-use `checkoutUrl` separately. Store labels
and IDs belong in configuration, not checkout source. The example is specific
to this sandbox; changing configuration supports another store.

## Limits before production

This is a local, non-purchasable preview, not a deployment-ready authorization
boundary. Inventory checks are snapshots, not reservations. Production work must add atomic coordination for simultaneous writers across
server instances and enforce validation at final order submission; integrate
freight preferences and accessorials; and test the full catalog, variant/modifier
combinations, promotions, digital/mixed carts and payments.
Native pickup inventory deduction was established in the earlier authorized
order test; this milestone deliberately submits no order. Browser-side config
must not be treated as trusted production authorization.

Tests: `node --test lib/warehouse/policy.test.mts` from core; normal TypeScript and
lint checks; live isolated browser verification using the dedicated fixtures.

## Session-sync browser requirement

The earlier HTTP 403 (`Rejected.`) was caused by the automated test using a
`HeadlessChrome` crawler identity. BigCommerce documents this behavior in its
[Catalyst 1.13.1 release notes](https://docs.bigcommerce.com/developer/docs/storefront/catalyst/release-notes/1-13-1).
The normal storefront sign-in and GraphQL checkout handoff work in visible Chrome;
no SDK sign-in fallback or checkout setting change is required.

Use the Chrome window opened by `node poc/warehouse-preview.cjs`. Automated local
preview checks use the same exported `launchPreviewBrowser()` helper. Do not
substitute a headless-shell browser, spoof its headers, or disable browser
security. Catalyst's Chromium Playwright project uses the documented full-browser
`channel: 'chromium'` option instead of the old security-disabling workaround.

The preview reports session-sync failures without logging the checkout token.
Return to the storefront cart to request a fresh handoff if a navigation fails.
Production activation remains outside this local-preview milestone.

## Server-owned cart warehouse and checkout validation

The cookie is a pre-cart preference. Once a cart exists, its authoritative
warehouse is a REST Management API cart metafield (`warehouse_checkout`,
`selection_v1`, permission `app_only`). It contains store hash, channel ID, cart ID,
warehouse ID, schema version, and a random revision. Store configuration resolves
location/pickup IDs and permitted modes; browsers cannot write that metadata.
New carts persist the warehouse validated before cart creation. Existing preview
carts acquire a record only on an authorized, inventory-checked mutation/handoff.

The picker submits its rendered cart ID and revision. A stale tab cannot overwrite
a newer selection. Every explicit selection, including reconfirming the same
warehouse, rotates the revision. Failed inventory checks leave the record intact.
Checkout capabilities from earlier revisions then receive HTTP 409.

`POST /api/warehouse/validate` uses an Authorization bearer capability issued only
through the session-owned checkout handoff. It is scoped to store, channel, cart,
warehouse, revision and checkout origin; expires after 30 minutes; and authorizes
validation only. No management credentials or customer data are returned. The
endpoint verifies the saved record, current cart/channel, location inventory and
native consignments. A requested fulfillment mode can be preflighted; the normal
validation checks the resulting consignment separately. Responses are no-store.
CORS preflight does not grant access: POST verifies the signed origin.

Optional server configuration:
- `WAREHOUSE_VALIDATION_SECRET`: stable secret of at least 32 characters; otherwise
  derives a purpose-separated key from existing `AUTH_SECRET`/`NEXTAUTH_SECRET`.
- `WAREHOUSE_VALIDATION_BASE_URL`: canonical storefront origin for the validation
  endpoint. The local preview defaults to its request origin. HTTPS is required
  except localhost/127.0.0.1. A future deployment must configure its canonical URL.

The standalone checkout validates before rendering, on SDK cart/consignment
changes, on focus/visibility return, and every 15 seconds while visible. Native
mode changes perform a preflight and trigger validation afterward. Errors disable
checkout controls with a retry message; stale/expired credentials require returning
to the cart for a fresh handoff. Revalidation does not reserve stock.

Metafield writes use expected-revision checks and readback, not a transactional
compare-and-swap. Overlapping writes can still race between servers; there is no
claim of atomic final inventory enforcement. This milestone remains development
only, with order/payment submission blocked. The browser runner still supplies
local assets; hosting/activation is a separate milestone.

A fresh session-authorized checkout handoff clears a native consignment that is
incompatible with the saved warehouse, after stock validation. Unselected drafts
are permitted while choosing fulfillment: BigCommerce may clear a pickup selection
after cart edits. The standalone checkout refreshes SDK state on focus and periodic
validation, so that such changes require a new fulfillment choice in the UI.

Focused tests: `node --test lib/warehouse/authorization.test.cjs
lib/warehouse/policy.test.mts`. The authorization test compiles the pure TypeScript
module in memory using the repository's existing TypeScript dependency.
