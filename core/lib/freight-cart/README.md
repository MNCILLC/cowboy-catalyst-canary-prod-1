# Cart fulfillment

Set server-only `FREIGHT_APP_URL` to the deployed Freight App origin (for example
`https://bc-freight-app.vercel.app`) and `FREIGHT_APP_CHECKOUT_TOKEN` to the same
store-specific checkout token used in the BigCommerce carrier connection's
`api_token`. `BIGCOMMERCE_STORE_HASH` must identify that store. Never prefix these
variables with `NEXT_PUBLIC_` or substitute the management API access token.
Redeploy/restart after configuring them.

A nonblank URL replaces the cart shipping estimator for physical carts with
Pickup at Warehouse and Ship. Without a URL, the original cart remains available.
A URL with missing/invalid credentials blocks saving and checkout until corrected.
No method is selected on a new cart. Previous choices are restored for the same
cart. Digital-only carts are exempt.

The Freight App needs migration `0013_cart_shipping_preferences.sql` and its
`GET`/`PUT /api/shipping/cart-preferences/{cartId}` endpoints deployed first. After
Catalyst deployment, enable `FREIGHT_CART_PREFERENCES_REQUIRED_STORES=cujyjwkq5o`
in Freight App to deny rates when this store's request has no cart ID or saved
choice. This requirement also affects other channels in the same store, so those
must adopt this cart flow or will not receive freight rates.

The action uses the signed session's cart ID, saves selections in Freight App,
and uses the existing Storefront GraphQL client to write
`bc_storefront.freight_fulfillment` with a JSON value containing `fulfillmentMethod`
and the saved `version`. Checkout is disabled until confirmed. `/checkout` also
verifies both records without caching, so a failed or partial save requires a
retry. Token/URL settings never reach client props.

Delivery service codes are HYD (liftgate delivery), ARN (notification), IDC
(inside delivery), and LDC (limited access). Checked boxes replace those four
Freight defaults for this cart; other defaults remain. Pickup clears them and
causes Freight App to return no freight rates. Keep the store's existing $0
warehouse pickup method enabled in BigCommerce.

The saved method is fulfillment intent, not native BOPIS. Standard hosted
checkout still owns final shipping-method selection and can show other configured
methods. This code does not lock/hide its methods or customize checkout. Customers
return to the cart to change accessorials. Verify the live provider request includes
`base_options.request_context.reference_values` with the cart UUID and that a new
quote reflects changed choices. Already-issued hosted checkout URLs cannot be
revoked by the cart guard.

The Freight App repository contains the cross-app synthetic HTTP simulation
(`tests/cart-shipping-simulation.mts`) and isolated actual-CartClient browser check
(`tests/cart-fulfillment-browser.mjs`). Set `CATALYST_REPO` to this checkout when
running them; see Freight App's `docs/CART-SHIPPING.md`. No live data is required.
