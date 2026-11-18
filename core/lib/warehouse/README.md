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
with `NODE_ENV=development` and `WAREHOUSE_PREVIEW_ENABLED=true`. Configure these
server-only values explicitly for a future activation rehearsal:

- `WAREHOUSE_REDIS_URL`: HTTPS Upstash REST endpoint.
- `WAREHOUSE_REDIS_TOKEN`: its server-side credential.
- `WAREHOUSE_REDIS_NAMESPACE`: a nonempty namespace shared by the backend instances.

Do not put these values in browser/checkout configuration. There is no process-local
record cache, cookie fallback for existing Redis carts, or metafield mirror. An
unknown provider, invalid configuration, storage error, or missing authoritative
record blocks the affected operation. Missing records return
`WAREHOUSE_RECOVERY_REQUIRED`; recovery/migration tooling is not implemented here.
Do not switch providers against existing carts without a separate migration plan.

Only the successful new-cart creation callback initializes a Redis record. The cart
UUID is reserved as that initialization operation ID. Picker changes carry a new
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

The normal warehouse feature remains development-only. To test a compiled
storefront, the rehearsal's disposable source copy has a local-only preview
override; do not apply that override to this repository or deploy its test build.
The local runner must retain its order/payment guards and must not change hosted
checkout settings. Keep private environment files and action keys out of Git.

Regression check (from core):
`node --test scripts/warehouse-rehearsal/artifact.test.cjs`.
The hosted browser acceptance checks include an accepted selection across
instances, an exact-payload retry after a lost response, stale picker rejection,
concurrent writers with one accepted revision, fresh checkout navigation,
backend restarts, and one backend losing its Redis connection. Successful Redis
writes alone are insufficient: both picker rendering and navigation must settle.
