<a href="https://catalyst.dev" target="_blank" rel="noopener norerrer">
  <img src="https://storage.googleapis.com/bigcommerce-developers/images/catalyst_readme_banner.png" alt="Catalyst for Composable Commerce Image Banner" title="Catalyst">
</a>

<br />
<br />

<div align="center">

[![MIT License](https://img.shields.io/github/license/bigcommerce/catalyst)](LICENSE.md)
[![Lighthouse Report](https://github.com/bigcommerce/catalyst/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/bigcommerce/catalyst/actions/workflows/lighthouse.yml) [![Lint, Typecheck, gql.tada](https://github.com/bigcommerce/catalyst/actions/workflows/basic.yml/badge.svg)](https://github.com/bigcommerce/catalyst/actions/workflows/basic.yml)

</div>

**Catalyst** is the composable, fully customizable headless commerce framework for
[BigCommerce](https://www.bigcommerce.com/). Catalyst is built with [Next.js](https://nextjs.org/), uses
our [React](https://react.dev/) storefront components, and is backed by the
[GraphQL Storefront API](https://developer.bigcommerce.com/docs/storefront/graphql).

By choosing Catalyst, you'll have a fully-functional storefront within a few seconds, and spend zero time on wiring
up APIs or building SEO, Accessibility, and Performance-optimized ecommerce components you've probably written many
times before. You can instead go straight to work building your brand and making this your own.

## Demo

- [Catalyst Demo](https://catalyst-demo.site)

![-----------------------------------------------------](https://storage.googleapis.com/bigcommerce-developers/images/catalyst_readme_hr.png)

<p align="center">
 <a href="https://www.catalyst.dev">🚀 catalyst.dev</a> •
 <a href="https://developer.bigcommerce.com/community">🤗 BigCommerce Developer Community</a> •
 <a href="https://github.com/bigcommerce/catalyst/discussions">💬 GitHub Discussions</a> •
 <a href="/docs">💡 Docs in this repo</a>
</p>

![-----------------------------------------------------](https://storage.googleapis.com/bigcommerce-developers/images/catalyst_readme_hr.png)

## Deploy via One-Click Catalyst App

The easiest way to deploy your Catalyst Storefront is to use the [One-Click Catalyst App](http://login.bigcommerce.com/deep-links/app/53284) available in the BigCommerce App Marketplace.

Check out the [Catalyst.dev One-Click Catalyst Documentation](https://www.catalyst.dev/docs/getting-started) for more details.

## Getting Started

**Requirements:**

- A [BigCommerce account](https://www.bigcommerce.com/start-your-trial)
- Node.js version 24
- Corepack-enabled `pnpm`

  ```bash
  corepack enable pnpm
  ```

1. Install the latest version of Catalyst:

   ```bash
   pnpm create @bigcommerce/catalyst@latest
   ```

2. Run the local development server:

   ```bash
   pnpm run dev
   ```

Learn more about Catalyst at [catalyst.dev](https://catalyst.dev).

## Resources

- [Catalyst Documentation](https://catalyst.dev/docs/)
- [GraphQL Storefront API Playground](https://developer.bigcommerce.com/graphql-storefront/playground)
- [GraphQL Storefront API Explorer](https://developer.bigcommerce.com/graphql-storefront/explorer)
- [BigCommerce DevDocs](https://developer.bigcommerce.com/docs/build)

## Storefront preview access

This optional visitor access gate is independent of BigCommerce's store preview code
and customer accounts. Configure the server environment (root `.env.local` when using
`pnpm dev`, or the deployment's environment settings):

```dotenv
STOREFRONT_PREVIEW_ENABLED=true
STOREFRONT_PREVIEW_CODE=<your-strong-shared-code>
STOREFRONT_PREVIEW_SECRET=<a-separate-random-secret-at-least-32-characters>
```

Generate the signing secret with `openssl rand -hex 32`. Never commit real values or
use `NEXT_PUBLIC_` variables. Restart the server or redeploy after configuration changes.
When running Next directly from `core/`, use a `core/.env.local` symlink to
`../.env.local` so both commands share the same settings.
The gate defaults to disabled. Omit `STOREFRONT_PREVIEW_ENABLED` or set it to `false`
to open the storefront. Only the exact value `true` enables it; blank or other values
also leave it disabled. Enabling the gate without
a code and a valid secret keeps access blocked, with an unavailable message on the gate.

Visitors enter the code at `/storefront-preview` and return to their original path and
query string. The signed, HttpOnly cookie lasts seven days and uses Secure on production
and HTTPS. Changing either the code or signing secret revokes existing cookies.
The code is submitted only in the POST body and is never stored in the cookie.

The gate runs before customer authentication and routing, protects storefront APIs,
GraphQL and sitemaps, and blocks unauthenticated Server Action POSTs. While enabled,
robots.txt disallows crawling and gated responses use no-store/noindex headers.
Public static assets (including images) remain public. Makeswift's API handler retains
its own authentication; editor storefront requests must unlock the gate as well.
Open the storefront directly and enter the code before using the Makeswift builder.
Browser restrictions on third-party cookies may require opening previews in a top-level tab.

The submission endpoint rejects cross-origin requests, limits form size, and throttles
after ten attempts per client IP per server instance over fifteen minutes. For distributed
production hosting, configure a shared rate limit at the trusted ingress for
`POST /api/storefront-preview`; the in-memory limit resets on process restarts and relies
on the ingress sanitizing `X-Forwarded-For`.

Run the preview-access regression suite with `pnpm --filter @bigcommerce/catalyst-makeswift test:preview-access`.
