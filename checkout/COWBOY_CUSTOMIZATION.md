# Cowboy Catalyst custom checkout

This directory is a store-owned fork of BigCommerce `checkout-js`, based on upstream commit
`fa4d7492c8207faacb97a8d6a900d037f44edd2b` (checkout version `1.883.0`). It is intentionally
kept outside the root pnpm workspace because upstream Checkout JS uses Node 22, npm 10, and its
own npm lockfile.

## BOPIS behavior

Before redirecting here, the Catalyst checkout route resolves the pickup method for the location
stored in the `shopping-location` cookie and starts checkout in Ship mode. It puts private markers
at the start of the checkout customer message:

```text
[Shopping location: Powell Wyoming (#2)][Pickup method: #2]
```

The custom checkout:

- recognizes those markers and offers Ship or Warehouse pickup;
- creates a native pickup consignment only when the shopper selects pickup;
- removes the markers from the shopper-editable order-comments field; and
- preserves the markers if the shopper adds or changes an order comment.

The pickup method name and location allocation remain authoritative BigCommerce consignment data.
No Management API token is present in this browser bundle.

## Development and build

Use Node 22 and npm 10 in this directory:

```bash
nvm use
npm ci
npm run dev:server
```

Build the uploadable checkout bundle with:

```bash
npm run build
```

The generated assets are written to `dist/`. Follow BigCommerce's custom-checkout installation
process to host the bundle and configure its `auto-loader.js` URL in Checkout Settings. Test the
loader URL on a non-production channel before activating it for production traffic.

## Store configuration

- Location 1: Forney Texas; pickup method ID 1.
- Location 2: Powell Wyoming; pickup method ID 2, `Pickup at Powell Wyoming Warehouse`.

Do not hardcode these IDs in the checkout UI. Catalyst resolves pickup methods by `location_id`
server-side before checkout creates a pickup consignment.

## Fulfillment and payment configuration

Checkout starts in **Ship** mode. After the shopper enters a valid address, it prefers a
BigCommerce shipping method named exactly `Sales Rep will provide shipping quote`. Configure that
method as a zero-dollar method in every shipping zone the store serves. The zero-dollar amount is
only a placeholder; the sales representative supplies the actual quote after the order is placed.

The shopper can instead choose **Warehouse pickup**. Checkout then creates a native BigCommerce
pickup consignment using the pickup method ID that Catalyst resolved server-side for the selected
shopping location.

For quote orders, enable only offline payment methods appropriate to the workflow (ACH and Check).
These methods place the order without capturing an online payment. Do not enable an online card
method for a quote order unless the business intentionally wants to collect the merchandise total
before freight is known.
