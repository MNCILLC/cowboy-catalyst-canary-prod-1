# Local warehouse picker milestone

Set `WAREHOUSE_MODE=multi-location` to enable the warehouse picker, location-specific
inventory checks, and warehouse checkout handoff. `staging` is a backward-compatible
alias. Omitting `WAREHOUSE_MODE` or setting it to `off` skips the picker and uses
Catalyst's standard checkout handoff in every environment. The legacy
`WAREHOUSE_PREVIEW_ENABLED` flag has no effect. BigCommerce's channel settings
determine which hosted checkout opens.

With `WAREHOUSE_MODE=development`, Catalyst checks the effective BigCommerce
checkout type and script URL, using store defaults for settings the channel
inherits. The standard local loader is `http://localhost:8080/auto-loader-dev.js`.
To use an HTTPS tunnel, set `WAREHOUSE_DEV_CHECKOUT_LOADER_URL` in Catalyst's
`.env.local` to the full script URL configured in BigCommerce. The tunnel must
also serve `warehouse-build.json` alongside that script.

Run from `core`: `node scripts/warehouse-dev.cjs`. This loads the existing local
environment and `.env.warehouse.example`, then starts port 3011 with a separate
`.next-warehouse-preview` build directory. Set `WAREHOUSE_ENV_FILE` to an absolute
path to use another store's warehouse configuration; use `WAREHOUSE_PREVIEW_PORT`
to change the port. Existing normal dev servers can remain running.

Launch `node poc/warehouse-preview.cjs` from the independent Open Checkout repo
(after running its `npm run dev` asset builder). Set `STOREFRONT_URL` if needed.
The launched Chrome browser is required for the isolated preview. Shop and sign
in normally; the cart's Checkout button passes the session cart to the
local checkout assets. The runner explicitly requests the JSON handoff with
`?handoff=json`. Its short-lived checkout URL must be kept private.

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

The explicit rehearsal response protocol is `warehouse-preview-v2`. Its `warehouseCheckout` object
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

## Strict submit-time validation

The validator accepts an optional `submission` snapshot (see the standalone
checkout's WAREHOUSE-PREVIEW.md for the portable JSON contract). Ordinary editing
checks still permit incomplete consignments. Submission checks require exactly one
fully assigned, selected native pickup/shipping consignment matching the warehouse;
legacy shipping-pickup options and simultaneous shipping/pickup selections fail.
The reviewed physical items, quantities, fulfillment identifiers and grand total
must match fresh server state. Checkout is read again after inventory validation,
and the warehouse record is checked again before the response. The validator echoes
the validated snapshot. It does not create an order or process a payment.

The body limit is 64 KiB to accommodate cart snapshots. No native order enforcement,
atomic cart lock, stock reservation or cross-tab deduplication is added. A change
following the last read can still race submission. Validation errors block the
supported checkout UI, which remains preview-only.

Run `node --test lib/warehouse/submission.test.cjs
lib/warehouse/authorization.test.cjs lib/warehouse/policy.test.mts`. The submission
tests compile the real validator and authentication/policy modules in memory with
explicit fake API, inventory and persistence dependencies. They do not read store
credentials or issue network requests. Concurrent successful validations and changes
after client validation are documented limitations, not guarantees tested away.

## Atomic persistence adapter: local opt-in integration

`atomic/persistence.ts` implements a server-only, dependency-injected Redis adapter.
It is wired through the backend persistence facade into the picker, cart inventory
checks, handoff, and validator, behind explicit local-preview configuration. The
existing default remains metafields; no environment file has been changed to
activate Redis. No BigCommerce writes, existing-cart migration, or hosted checkout
activation are part of this integration test milestone. The standalone checkout
repository and its public validation contract are unchanged.

The adapter exposes `read({storeHash, channelId, cartId})` and
`compareAndSet({...scope, warehouseId, expectedRevision, operationId})`.
Ownership, warehouse configuration, and stock checks remain the caller's job.
Cart, revision and operation UUIDs are normalized to lowercase to prevent aliases.
Use a stable UUID operation ID for retries of the same selection intent; a genuinely
new action uses a new ID. `expectedRevision: null` means create-only, not overwrite.

One Redis hash per namespace/store/channel/cart holds the current record and
successful operation receipts. A Lua EVAL checks identity, record validity,
revision and operation ID, then performs one multi-field HSET for both the head
and receipt. There is no lease, second datastore write, cache, TTL, or in-memory
fallback. Distinct concurrent requests with the same expected revision have one
winner; losers receive `STALE_WAREHOUSE` (409). A reused operation ID with a
changed payload gets `OPERATION_CONFLICT` (409).

Successful retries return the original `record`, plus `currentRecord` from the
same atomic operation and `replayed: true`. An old receipt is not permission to
restore that old selection: future callers must use the current authority for
cookies, handoffs and checkout authorization. A timeout can mean the commit
succeeded but its response was lost; retry the same operation ID. Transport
failures return `WAREHOUSE_STORAGE_UNAVAILABLE` (503), without exposing underlying
credentials. Invalid/expiring state fails closed. A missing record with a non-null
expected revision is stale; the adapter never repopulates it from a metafield.

Receipts are retained with the cart record, bounded at 1,024 successful operations
by default (configurable up to 10,000). At the limit, new selections fail with
`SELECTION_LIMIT`; existing receipts remain replayable. There is no automatic
expiry or receipt eviction. Before rollout, define terminal-cart cleanup and
retention, durable/no-eviction storage, a consistent primary execution endpoint,
and recovery procedures. Local atomicity does not prove cloud failover durability.

`atomic/upstash.ts` supplies an explicit-config factory using the installed SDK,
HTTPS, a fresh request deadline, no caching, no automatic pipelining, and no
implicit environment loading or fallback. The hosted Upstash transport is not
live-tested in this milestone. All consumers must switch to the same authority
together during a later rollout; mixed metafield/Redis writers are unsafe. Any
BigCommerce mirror must remain secondary and requires separate reconciliation.

Run the synthetic two-process suite from `core` using explicitly supplied local
Redis binaries (nothing is installed globally):

```sh
ATOMIC_TEST_REDIS_SERVER=/absolute/path/to/redis-server \
ATOMIC_TEST_REDIS_CLI=/absolute/path/to/redis-cli \
node --test lib/warehouse/atomic/persistence.test.cjs
```

The suite starts its own private temporary Unix-socket Redis with TCP disabled,
AOF persistence, `appendfsync always`, and `noeviction`. Two independent Node
processes rendezvous after reading the same revision, then race real Lua writes.
It covers 20 creation races, 40 update races, duplicate and conflicting operation
IDs, lost responses, old receipt replay, signed capability invalidation, scope
isolation, process exits, Redis outage/restart and hard-crash recovery, corrupt
records, missing records, and receipt limits. It kills its own workers/server and
removes its private data directory afterward. No store credentials are loaded;
an import allowlist excludes live API modules, and HTTP fetch is prohibited.

Atomic selection is not an inventory reservation, a transaction spanning
BigCommerce and Redis, or mandatory enforcement at native order submission.
Redis EVAL semantics: https://redis.io/docs/latest/develop/programmability/eval-intro/

### Connecting the adapter to the picker and validator

The opt-in provider is `WAREHOUSE_PERSISTENCE_PROVIDER=redis`. It is accepted only
in validated staging mode, or with the legacy development preview flag. Configure these
server-only values explicitly for a future activation rehearsal:

- `WAREHOUSE_REDIS_URL`: HTTPS Upstash REST endpoint.
- `WAREHOUSE_REDIS_TOKEN`: its server-side credential.
- `WAREHOUSE_REDIS_NAMESPACE`: a nonempty namespace shared by the backend instances.

Do not put these values in browser/checkout configuration. There is no process-local
record cache, cookie fallback for existing Redis carts, or metafield mirror. An
unknown provider, invalid configuration, or storage error blocks the affected operation.
If an existing cart has no record, the picker automatically checks its physical items
at the enabled, configured shipping origin. Sufficient stock assigns that warehouse.
A shortage leaves the cart unassigned and lets the shopper choose another warehouse.
If the origin is unavailable, the shopper chooses an enabled warehouse.
Adding items and entering checkout still return `WAREHOUSE_RECOVERY_REQUIRED` until
the picker validates stock and saves the first selection for that cart.

The new-cart creation callback initializes a Redis record using the cart UUID as
its reserved operation ID. Existing-cart recovery and later picker changes carry a new
UUID plus the rendered cart/revision; uncertain failures offer a Retry button that
reuses the entire original request. New choices create new operation IDs. An
accepted operation is looked up after session/channel authorization but before
stale/stock checks, making lost commit responses recoverable. Receipt replay returns
the current head, so an old accepted operation cannot restore an obsolete warehouse
or cookie. A new selection must pass stock checks and the final atomic CAS.

Reads are scoped by server store configuration and the authenticated cart channel
(or the signed capability's channel in validation). Handoff and validation retain
their final revision checks. Checkout continues to use the existing signed HTTP
contract and has no Redis or Catalyst imports. The standalone repository is unchanged.

Synthetic integration verification (from `core`, with explicit absolute paths to
local `redis-server` and `redis-cli`):

```sh
ATOMIC_TEST_REDIS_SERVER=/path/to/redis-server \
ATOMIC_TEST_REDIS_CLI=/path/to/redis-cli \
node --test --test-concurrency=1 lib/warehouse/atomic/integration.test.cjs
```

The suite starts private Redis with TCP disabled, AOF fsync always, and no eviction,
then forks two backend workers with synthetic store/channel/cart IDs and a synthetic
shared signing secret. It runs the actual picker action/retry helper, server stock
logic, persistence facade, atomic scripts, handoff, and validator route handler.
Framework session/cookie/cache calls and BigCommerce API responses are explicit
fixtures. The Upstash factory is replaced with a Unix-socket transport into the
actual adapter. Unexpected API calls fail; external fetch is forbidden; no env
files or management credentials are loaded. The legacy provider regression uses
in-memory metafields only. Workers and Redis are stopped and temporary data removed.

This establishes local function/route-contract integration and cross-process Redis
coordination. It does not establish browser rendering, Next server-action transport,
live BigCommerce behavior, or hosted Upstash durability/failover. Those require a
separate controlled rehearsal. Atomic warehouse selection is not an inventory
reservation or atomic order-submission gate: native SDK submissions still have the
previously accepted final-validation-to-submission race limitation.

## Multi-instance browser rehearsal: use one compiled artifact

Do not load-balance this browser rehearsal between independent `next dev`
compilers. A warehouse action can finish and commit correctly while its React
transition remains pending when the response and browser runtime come from
separate development builds. A shared Server Actions encryption key alone does
not make those builds interchangeable.

Build the isolated storefront copy once, then start both loopback backend
processes from that exact artifact with `next start`. Share the build-time
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, warehouse validation secret, Redis namespace,
and store/channel configuration. Restarts must reuse that artifact and key.
The standalone checkout continues to load its own independently built assets;
it must not import Catalyst's server code or Redis credentials.

`scripts/warehouse-rehearsal/artifact.cjs` supplies `readArtifact`,
`validateLaunch`, and `startBackend` for the local rehearsal runner. It rejects
development mode, a changed build manifest, a different action key, and a
mismatched output directory. `startBackend` binds only to localhost and always
uses `next start`; it never compiles or edits application source. The artifact
fingerprint covers the build ID and build/action manifests, not every asset byte.
Use the same immutable output directory for both processes.

Compiled rehearsals now use `WAREHOUSE_MODE=staging`; temporary source overrides
are no longer required. Staging must retain purchase blocking and must never be
treated as a production purchase mode.
The local runner must retain its order/payment guards and must not change hosted
checkout settings. Keep private environment files and action keys out of Git.

Regression check (from core):
`node --test scripts/warehouse-rehearsal/artifact.test.cjs`.
The hosted browser acceptance checks include an accepted selection across
instances, an exact-payload retry after a lost response, stale picker rejection,
concurrent writers with one accepted revision, fresh checkout navigation,
backend restarts, and one backend losing its Redis connection. Successful Redis
writes alone are insufficient: both picker rendering and navigation must settle.

## Production-mode staging configuration

Production builds accept `multi-location`, its alias `staging`, or `off` (the default).
The `preview` and `development` modes require the development server. Use
`WAREHOUSE_MODE=preview` for the lightweight local rehearsal. Invalid explicit
values fail configuration validation.
Staging validates configuration during Next build and Node server startup, and
again at warehouse entry points. It uses `.next-warehouse-staging` as its build
output; both instances must run the same artifact and share their action key,
validation secret, Redis namespace, and store/channel configuration.

See `.env.warehouse.staging.example`. Staging requires:

- A nonempty, valid `WAREHOUSE_CONFIG` with unique warehouse/pickup-method IDs.
- `WAREHOUSE_PERSISTENCE_PROVIDER=redis`, an HTTPS Redis origin, a nonempty token,
  and a namespace. There is no staging metafield fallback.
- An explicit `WAREHOUSE_VALIDATION_SECRET` of at least 32 characters.
- `WAREHOUSE_VALIDATION_BASE_URL`: the HTTPS storefront origin (no path/trailing
  slash, credentials, query, or fragment).
- `WAREHOUSE_CHECKOUT_ORIGINS`: a JSON array of allowed HTTPS checkout origins.
- A store hash and positive channel ID for this backend.

Configuration errors never include credentials. The validator and handoff reject
unlisted checkout origins; staging also checks the signed capability's channel
against this backend's configured channel. Existing signed cart, store, expiry,
revision, stock, and consignment checks remain in place.

The explicit JSON handoff remains `warehouse-preview-v2` with `preview: true`. The independent
checkout must be built in its own `WAREHOUSE_CHECKOUT_MODE=staging` mode, with a
public checkout-origin/validator-endpoint mapping. Its `warehouse-build.json`
identifies that mode. Do not substitute an ordinary/off checkout build for an
enabled staging store. Management credentials, Redis credentials, and signing
secrets stay on the backend; no Catalyst import is needed in checkout.

This adds no purchase mode or hosted activation. Runner-independent initialization
is implemented below; verification against real hosted domains remains outstanding. Native-SDK submission-enforcement limits still apply.

Isolated tests: `node --test lib/warehouse/configuration.test.cjs` plus the existing
warehouse authorization/submission tests. The two-process atomic integration
suite includes a production staging case and uses only synthetic carts and a
private local Redis socket; external HTTP is prohibited by the harness.

## First-party session initialization for standalone checkout

The standalone staging checkout can now initialize without runner injection once
it is loaded. Ordinary staging cart navigation to `/checkout/` checks that the
channel has custom checkout configured, validates the warehouse and cart, then
redirects the browser to the allowlisted BigCommerce checkout URL. The existing
development loader check still applies in development mode. Rehearsal clients
request `/checkout/?handoff=json` to receive the no-store `warehouse-preview-v2`
payload. Legacy preview mode requires the rehearsal client.

`/[locale]/warehouse-initialize/` (public locale prefix according to storefront
routing) supplies a runner-independent, popup-based authorization bridge. It is
available only in staging. The request must have exactly `cartId` (UUID),
`requestId` (64 lowercase hex characters) and an HTTPS `checkoutOrigin` from
`WAREHOUSE_CHECKOUT_ORIGINS`. The actual shopper session must own that cart; the
route also honors checkout's sign-in requirement. Cart identifiers and origin
allowlisting never substitute for session authorization.

`authorizeWarehouseInitialization()` checks session/channel ownership, authoritative
Redis state, location inventory and the latest revision. Unlike cart-entry
preparation, it does not mutate consignments. The bridge issues the existing
30-minute signed capability and posts it only to the exact requested/allowed
checkout origin. Checkout still performs full validation before mounting. A stale
or incompatible cart must return through cart-entry preparation; a missing Redis
record is not silently recreated.

The standalone build mapping must include this route's full HTTPS URL as
`initializationEndpoint`. Its documented `warehouse-initialization-v1` postMessage
contract allows another backend to implement equivalent authorization without
coupling checkout to Catalyst. No credentials are passed in redirect URLs or
persistent browser storage. HTML responses are no-store, no-referrer and restricted
by nonce-based CSP and frame denial; failures contain no raw upstream exceptions.

A customer clicks Continue securely in checkout, then the storefront window
returns authorization and closes. Reload requires fresh authorization. Expired
sessions require storefront sign-in and return from the cart; silent renewal and
payment-return recovery are outside this non-purchasable milestone. Actual hosted
COOP/popup/session behavior still requires deployment validation. No hosted
checkout settings are activated by these code changes.

## Warehouse availability on product pages and cards

When warehouse mode is enabled, product pages and catalog cards use server-side,
location-specific available-to-sell inventory. `availability.ts` reads the session's
authoritative warehouse and batches catalog metadata and inventory requests in
groups of 50 product IDs. Inventory pagination includes every variant. React
cache deduplicates only within a request; inventory fetches remain no-store.

Before selection, shoppers see Choose a warehouse to see availability. Product
stock and purchase controls do not fall back to aggregate inventory on failures.
Untracked physical products are unavailable in this flow, matching the existing
cart validation policy. Variant cards show Options available without combining
quantities; product pages use the selected variant. Location backorder promises
are not inferred from aggregate data. The displayed quantity is a stock snapshot,
not a reservation or an amount remaining after the shopper's cart. Existing
catalog restrictions, wholesale sign-in and server cart/submission checks remain.

Makeswift API responses contain only public display data. Their client cache keys
include the authoritative selection/revision, so a successful picker change
reloads cards; the URL cache key is never trusted to select inventory. Guest
product pages display availability without exposing wholesale prices. Warehouse
mode off retains the original stock display. Catalog stock filters are unchanged.

Run the isolated availability tests from the repository root:
`node --test core/lib/warehouse/availability*.test.*`. They use synthetic catalog,
stock and session fixtures, covering location isolation, variants, pagination,
missing stock, disabled stock, malformed responses and service failures.

### Checkout-owned freight delivery preferences

Set the server-only `WAREHOUSE_FREIGHT_ENABLED=true` to enable `/api/warehouse/freight`. Configure the standalone checkout's optional `freightEndpoint` to this route on the same backend origin as warehouse validation. The backend uses the existing private Freight App connection variables and never sends the Freight App credential to checkout.

Both reads and writes require the initialized cart capability, allowed checkout Origin, matching warehouse revision, channel/cart checks, and current inventory validation. Writes additionally validate the requested fulfillment mode (pickup-only warehouses cannot request shipping). The Freight App's expected-version update rejects stale tabs; a retry can reuse only an identical immediately succeeding version. Readback and a second warehouse validation must pass before checkout accepts the operation. This cannot make separate BigCommerce, warehouse Redis, and Freight App writes atomic.

The old cart fulfillment metadata is not required by this checkout-owned path. Non-warehouse cart behavior stays unchanged. Run `node --test core/lib/warehouse/freight.test.cjs` for isolated HTTP transport, stale-version, lost-response retry, outage, pickup-clearing, and warehouse race tests.

Pickup-only handoffs now attach native pickup before redirecting to BigCommerce. Without a consignment, BigCommerce can reject a product stocked only at the pickup location during checkout loading, before the standalone UI can select pickup. `preparePickupOnlyHandoff` reuses an already matching consignment, otherwise replaces fulfillment with the configured pickup method and exact cart quantities, checks native readback, and checks the warehouse revision before and after writes. The first-party initialization popup remains read-only. Test this path with `node --test core/lib/warehouse/pickup-handoff.test.cjs`.


## Disabled-by-default Check-only test authorization

`WAREHOUSE_CHECK_TEST_AUTHORIZATION` is intentionally unset. No environment value or hosted setting is installed by this implementation. The standalone checkout must independently opt in with `allowCheckTest: true` on its matching `WAREHOUSE_CHECKOUT_STORES` entry in a staging build. Both opt-ins are required; `preview: true` remains required, and redirect finalization remains blocked.

The optional server JSON policy is strict: `id` (UUID), `storeHash`, `channelId`, `cartId` (UUID), `customerId` (positive, signed-in test customer), `warehouseId`, `revision` (UUID), `productId`, `variantId`, `quantity` (exactly 1), `grandTotal` (exact positive reviewed total), `currency` (three uppercase letters), and `expiresAt` (Unix seconds, at most 15 minutes away). Never commit a real authorization. Cart/channel/customer/items/currency/total and warehouse revision must match; digital/custom/gift-certificate line items are excluded. Missing policy returns no permission; invalid or expired configuration fails closed.

The existing authenticated validator adds optional `checkTestAuthorization: {version:1, methodId:"cheque", token, expiresAt}`. The HMAC token binds the complete configured policy and checkout origin. Normal validation remains read-only. A submission claim is a POST to that same endpoint with the usual bearer credential, cart/revision, strict `submission` snapshot, and `checkTest: {token, methodId:"cheque", gatewayId:null}`. Full warehouse validation is repeated, checkout is reread, and current configuration is checked before a Redis Lua claim. Only a successful new claim returns `checkTestClaimed:true`; old validators cannot authorize execution.

Claims use a distinct `:check-test:v1:` key family under the configured Redis namespace, keyed by store/channel/cart. Keys intentionally have no TTL and no automated release/replay path. A lost response, SDK failure, or changed checkout after claim requires operator reconciliation; rotating the grant ID or opening another tab cannot re-arm the same cart. Use durable Redis with eviction disabled and preserve its namespace/data. Never delete an attempt record or re-arm an uncertain cart without determining whether BigCommerce created an order. No reconciliation mutation endpoint is provided in this milestone.

This is an exclusion mechanism for cooperating checkout clients, not a mandatory BigCommerce order gate, stock reservation, or cross-service transaction. A direct native request or a remote change after the last validation remains outside its enforcement boundary. No payment data is sent to Catalyst, and management credentials remain server-only.

Rollback before a later authorized live test: remove the backend policy, restore the known blocked checkout bundle and original channel loader, and close/reload test tabs. Already accepted/in-flight native submissions cannot be undone by rollback; order cancellation/restocking needs separate authorization. This milestone permits isolated tests only, not activation or order submission.

Run `node --test core/lib/warehouse/check-test.test.cjs core/lib/warehouse/route-access.test.cjs` with explicit `ATOMIC_TEST_REDIS_SERVER` and `ATOMIC_TEST_REDIS_CLI` paths. The suite uses synthetic fixtures, an external-network prohibition, and an ephemeral Unix-socket Redis server with TCP disabled. No store credentials/env files are loaded.


### Cart-scoped Test payment provider authorization

`WAREHOUSE_TEST_PROVIDER_AUTHORIZATION` is absent by default. This separate staging-only policy has the same cart/customer/store/channel/warehouse/revision/product/variant/quantity/total/currency/expiry fields as the Check policy, plus required `methodId: "bigpaypay"` and `testMode: true`. Expiry must be within 15 minutes. No environment values are installed by the implementation.

The authenticated validator offers `testProviderAuthorization: {version:1, methodId:"bigpaypay", testMode:true, token, expiresAt}` only after matching the policy and reading BigCommerce's enabled payment methods. Only an exact `bigpaypay` record with `test_mode:true` is accepted. Missing, duplicate, malformed, live, timed-out, or unavailable results fail closed. The V2 methods endpoint can omit providers; absence never grants permission. Provider state is checked again immediately before the claim. This is a test-provider check, not certification of BigCommerce Payments or other production gateways.

A claim includes the normal capability and strict submission snapshot plus `testProvider: {token, methodId:"bigpaypay", gatewayId:null, usesStoredInstrument:false, shouldSaveInstrument:false}`. Card numbers, security codes, hosted-field values, and payment tokens must never be sent to this endpoint. Requests containing both test claim types are rejected. The provider token uses a separate HMAC purpose from Check. Both methods deliberately share the existing `check-test:v1` cart tombstone: changing method, grant ID, tab, or backend instance cannot authorize another attempt. Never delete or reset a consumed claim, even after an ambiguous SDK response.

The standalone checkout independently requires `allowTestProvider:true` for its matching staging store entry. Its default remains blocked; enabling both Check and Test provider opt-ins is invalid. The native SDK card form remains responsible for payment; no backend payment processing was added. Production gateways, custom submit callbacks, stored instruments, and saving instruments are excluded from this test permission. The native SDK submission-enforcement limitation and post-validation race boundary still apply.

Before a hosted test: run the isolated tests, prepare a fresh dedicated cart, verify the channel exposes the test provider, authorize exactly one amount and item, and use only synthetic test card details. After the one attempt (successful or ambiguous), restore the original loader, remove the temporary policy and checkout opt-in, redeploy and verify both blocks, and reconcile order/transaction/inventory records without retrying. Order cancellation or inventory restoration is a separate action.

### Default-off policy for normal Test-provider carts

`WAREHOUSE_TEST_PROVIDER_POLICY` adds automatic per-cart grants without a manually
prepared product/cart authorization. It is **unset by default**, and this change
installs no environment values. It does not enable the standalone checkout's
`allowTestProvider` flag or change the preview/handoff flow. Keep both checkout
payment opt-ins off until a separately authorized rehearsal.

An enabled policy is strict JSON with these required fields:

- `enabled: true`, `version: 1`, `id` (a policy-generation UUID),
  `methodId: "bigpaypay"`, `testMode: true`.
- `storeHash`, `channelId`, `origins` (exact HTTPS checkout origins),
  `warehouseIds`, and `currencies` (uppercase three-letter codes).
- `grantTtlSeconds` (30–900).

Normal carts have no custom upper limit on line count, quantity, or grand total.
Existing policies may still contain `maxLineItems`, `maxQuantity`, and
`maxGrandTotal`. The backend ignores these fields when authorizing a cart.

For this project, any later activation is limited to Sandbox Cowboy
`3olkgrdpfq`, channel `1912525`, using only its Test payment provider. Configured
store/channel and checkout origins must also match the warehouse backend's
staging or local development configuration. For local submission, set the normal
policy in Catalyst’s `.env.local` and enable `allowTestProvider` in the local
checkout’s matching store entry. For local offline Check, set `allowLocalCheck: true` in that policy
and `allowCheckTest: true` on the local checkout store. The validator verifies BigCommerce lists
`cheque`, signs a separate Check grant, and records the selected method against the same
one-attempt-per-cart key. Hosted configuration rejects this local option. Local grants and claims use the same warehouse,
test-mode payment provider, and Redis recovery checks as staging. Other stores are not part of this milestone; the standalone
checkout contract remains store-configurable.

The backend accepts ready physical-product carts with multiple lines/quantities,
Forney shipping or pickup, and Powell pickup according to configured warehouse
rules. Guest customer ID `0` is supported only through the existing authenticated
cart capability; it does not grant anonymous access to arbitrary carts. Empty,
free, nonphysical, incomplete-fulfillment, and already ordered carts
receive no grant. A claim for an ineligible cart is rejected.

The existing public `testProviderAuthorization`/`testProviderClaimed` contract is
unchanged. Its opaque HMAC token now binds the entire policy hash, origin, cart,
customer, warehouse/revision, currency, a hash of the canonical item/fulfillment/
total snapshot, and an expiry. Hashing the snapshot keeps tokens small for larger
carts. Policy changes revoke old grants; rotate `id` whenever re-enabling a policy
so a previously issued, unexpired token cannot become valid again.

Offers repeat stock/revision/fulfillment validation and verify the provider is in
test mode without consuming a claim. Claims repeat those checks, compare the
checkout readback, recheck policy/configuration and expiry, then use the same
permanent cart attempt record as Check and the earlier Test-provider rehearsal.
Concurrent claims have one winner; lost replies remain blocked. Existing recovery
checks still run before authorization. Check, wallets, stored/saved instruments,
and real gateways are not authorized. Configuring this new variable (even empty
or `{"enabled":false}`) suppresses legacy Check grants and Test-provider fallback.
Combining an enabled normal policy with either legacy authorization is rejected.

Rollback: keep the checkout opt-ins off and set the normal policy to exactly
`{"enabled":false}` (or remove it **and** both legacy authorization variables),
then redeploy the backend. Restore a known blocked checkout bundle and the prior
loader if a later rehearsal changed them. Preserve Redis data, namespace, and
all attempt/recovery records. Policy removal does not undo an accepted/in-flight
native SDK request and does not permit an uncertain cart to retry. The existing
native-SDK enforcement boundary and gap between warehouse validation and the
atomic attempt claim remain; this is not a BigCommerce-wide purchasing lock.

Isolated coverage: `test-provider.test.cjs`, `check-test.test.cjs`,
`recovery.test.cjs`, `route-access.test.cjs`, and `submission.test.cjs`. Run with
explicit private Redis binary paths as above. All HTTP responses and carts are
synthetic; real Redis uses a temporary Unix socket with TCP/persistence disabled.
No local env files, real store APIs, orders, or payments are used by the tests.
