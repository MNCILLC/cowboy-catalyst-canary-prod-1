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
