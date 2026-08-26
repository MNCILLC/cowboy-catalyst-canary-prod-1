# Project

This is a BigCommerce Catalyst storefront.

## Technology

- Next.js
- React
- TypeScript
- Tailwind CSS
- BigCommerce Catalyst
- BigCommerce Storefront GraphQL API
- Makeswift
- pnpm
- Turborepo

## Project structure

The main storefront application is located in:

core/

Catalyst Vibes components are located in:

core/vibes/

Makeswift integration code is located under:

core/lib/makeswift/

## Development

Install dependencies:

pnpm install

Run the storefront:

pnpm dev

The storefront normally runs at:

http://localhost:3000

## Coding guidelines

- Use TypeScript.
- Follow the existing Catalyst architecture and conventions.
- Prefer modifying existing Catalyst/Vibes components rather than duplicating them.
- Use Tailwind CSS for styling.
- Preserve existing BigCommerce GraphQL patterns.
- Preserve Makeswift compatibility.
- Do not hardcode store-specific values when they can be provided through configuration or environment variables.
- Do not expose BigCommerce access tokens or other secrets to client-side code.
- Run formatting, linting, and type checking after significant changes.
