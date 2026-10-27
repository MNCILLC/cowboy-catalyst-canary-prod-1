// Map the reader's page numbers to the unchanged source PDF. All numbers are one-based.
export function getCatalogPageCount(pdfPageCount: number, twoUp: boolean): number {
  return pdfPageCount * (twoUp ? 2 : 1);
}

export function getCatalogPageSlice(catalogPage: number, twoUp: boolean) {
  if (!twoUp) return { pdfPage: catalogPage, half: undefined };

  return {
    pdfPage: Math.ceil(catalogPage / 2),
    half: catalogPage % 2 === 1 ? ('left' as const) : ('right' as const),
  };
}

// PDF destinations refer to source pages; open their left half in Two-Up mode.
export function getCatalogPageForDestination(pdfPage: number, twoUp: boolean): number {
  return twoUp ? (pdfPage - 1) * 2 + 1 : pdfPage;
}

// Two-Up spreads keep both halves of a source sheet together; ordinary catalogs have a cover.
export function getCatalogPageRange(
  page: number,
  totalPages: number,
  spread: boolean,
  twoUp: boolean,
) {
  if (!spread || totalPages === 0 || (!twoUp && page === 1)) {
    return { firstPage: page, lastPage: page };
  }

  const firstPage = twoUp ? page - ((page - 1) % 2) : page - (page % 2);

  return { firstPage, lastPage: Math.min(firstPage + 1, totalPages) };
}
