# Local warehouse development

Start the standalone checkout first:

```sh
cd /Users/kylehurt/dev/bc-apps/bc-custom-checkout
npm run dev
```

Start Catalyst in another terminal:

```sh
cd /Users/kylehurt/dev/sandbox-catalyst/catalyst-sandbox-11
pnpm dev
```

Browse http://localhost:3000 in regular Chrome. Catalyst uses the root `.env.local` (the core file links to it), port 3000, and the existing `mnc-195-2-codex-1` development branch. The standalone checkout serves its development bundle from port 8080. The Freight App remains at https://bc-app-freight-app.ngrok.dev; start that app/tunnel using its existing workflow if needed.

Choose Ship/Pickup in Forney, TX or Pickup in Powell, WY, add an in-stock item, and select Checkout in the cart. Sign in if requested. Checkout stays on the native BigCommerce checkout origin but loads your local code. Allow that sandbox checkout site's localhost access if Chrome requests it, then click Continue securely to authorize the cart against your local storefront session. The popup closes after authorization. Edit cart and Return to local cart lead back to localhost.

Orders remain blocked. Development mode requires NODE_ENV=development and cannot be used in a production build. There is no preview runner or browser request interception. Warehouse updates use the dedicated hosted Redis database and namespace `warehouse-local-dev-1912525`. An older cart with no record in this namespace shows Start new local test cart; this detaches the browser from the old cart without deleting the sandbox cart.

## Sandbox activation and rollback

Only channel 1912525 points to `http://localhost:8080/auto-loader-dev.js` as its custom checkout loader. Other browsers/devices need their own local server to load it. Storefront site URLs, checkout domain, shipping configuration and the Freight App were not changed.

Private backups are in `/Users/kylehurt/.config/catalyst-rehearsal/local-workflow/`: `checkout-settings-before.json`, `catalyst-env-before`, and `sites-before.json`. Restore the saved channel checkout settings through the channel checkout-settings API if reverting activation; do not change the site URL. Stop the development servers and restore the saved root env to revert local configuration. Do not commit private env files or backups.

The previous checkout path `/Users/kylehurt/dev/sandbox-catalyst/checkout-powell-poc` is a compatibility symlink. Source, Git metadata, dependencies and existing uncommitted work live in the independent checkout repository at the new path.
