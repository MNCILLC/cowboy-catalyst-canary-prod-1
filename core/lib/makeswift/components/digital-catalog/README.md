# Digital Catalog

In Makeswift, add **Sections / Digital Catalog**, open **PDF file**, and choose or upload a multipage PDF from the file library. This uses the same native library picker as the slideshow image control, configured to return a URL without requiring image dimensions. **PDF URL (fallback)** remains available for external URLs and previously saved catalogs; a selected library file takes priority. Configure the title, description, Two-Up setting, page layout, download visibility, button label, and download filename. The PDF extension is optional for URLs with query strings or CDN paths.

The reader shows a standalone cover followed by spreads (2–3, 4–5, etc.). Containers narrower than 720px show one page at a time. Readers can navigate with previous/next, type a page number and press Enter, zoom to 200%, and enter full screen where the browser permits it. Focus the page area to use Left/Right and Home/End. Text selection and PDF links are supported. Only the visible pages are rendered.

## Two-Up PDFs

Enable **Two-Up** for landscape PDFs containing two equal-width portrait catalog pages per PDF page. Each source page is split vertically at its center and displayed in left-then-right order: PDF page 1 left, PDF page 1 right, PDF page 2 left, and so on. A 20-page PDF becomes 40 digital pages. The reader respects the PDF's displayed rotation and crops without stretching either half.

The existing **Page layout** setting still controls whether to show a single digital page or a cover followed by spreads (2–3, 4–5, etc.). Page counts, jumps, keyboard navigation, and zoom use digital pages. Internal PDF links open the left half of their target PDF page. Visible text and links remain available; content completely outside the selected half is excluded from keyboard focus and the accessibility tree.

Two-Up defaults to off. Changing it restarts the viewer at digital page 1. The original PDF is never rewritten: **Download PDF** still saves the original landscape document. This setting assumes sequential reading order, not printer-imposed spreads.

Run `pnpm test:digital-catalog` for page-order and destination mapping checks. In a browser, use a landscape PDF with distinct left/right content to verify both halves, cross-sheet spreads, the last page, mobile width, zoom, setting changes, and an unchanged original download.

## Hosting

Use a public HTTPS URL with a direct PDF response. The PDF host must allow browser CORS requests from the storefront and preview origin; otherwise the reader shows an error with an **Open PDF** fallback. A same-origin file in `core/public/` (for example `core/public/catalogs/catalog.pdf`, entered as `/catalogs/catalog.pdf`) avoids cross-origin configuration. No BigCommerce token or server proxy is required.

The download button saves the original PDF using a Blob URL, including when the PDF is hosted on a CORS-enabled external origin. Disabling the button hides that UI; it does not restrict access to a public PDF. Password-protected PDFs provide a direct-open fallback.

## Assets and development

`pnpm generate` prepares versioned PDF.js worker, CMap, font, and WASM files in the ignored `core/public/pdfjs/` directory before generating the existing GraphQL schema. Both `pnpm dev` and `pnpm build` run this step. For a renderer-only preview, run `pnpm prepare:pdf` from `core/`. These assets are served locally; no third-party PDF rendering service is used. Keep the pinned `react-pdf` and `pdfjs-dist` versions compatible when upgrading.

The renderer loads only in the browser through a dynamic import. It targets current browsers supported by React-PDF. Full screen may be unavailable in the Makeswift editor iframe; verify it on the storefront.

## Verification

Check a multipage PDF at desktop and mobile widths; navigate past the cover and to the last page, jump to a page, zoom, download, and choose a different PDF from the library in the editor. Clear the library selection to verify the saved fallback URL still works. Check a missing URL and a password-protected PDF for useful fallbacks. Verify the download toggle hides the button. Run formatting, ESLint, and TypeScript checks after changes.

The `/pdfjs/` asset directory and `/catalogs/*.pdf` public files pass through the existing preview access gate, then bypass storefront route lookup.
