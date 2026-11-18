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

The response protocol is `warehouse-preview-v1`. Its `warehouseCheckout` object
contains `version: 1`, `preview: true`, `cartId`, and a public warehouse object:
`id`, `label`, `pickupLabel`, `locationId`, `pickupMethodId`, `allowShipping`.
No Catalyst package import or management credential is required in checkout.
The isolated browser consumes the one-use `checkoutUrl` separately. Store labels
and IDs belong in configuration, not checkout source. The example is specific
to this sandbox; changing configuration supports another store.

## Limits before production

This is a local, non-purchasable preview, not a deployment-ready authorization
boundary. Inventory checks are snapshots, not reservations. Production work must
add a durable cart-bound warehouse record and authenticated validation across
checkout refresh, edits, simultaneous requests/tabs and final submission; handle
switching stock after checkout has opened; integrate freight preferences and
accessorials with the chosen fulfillment mode; and test the full catalog,
variant/modifier combinations, promotions, digital/mixed carts and payments.
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
