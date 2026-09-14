export interface StockDisplayInventory {
  isInStock: boolean;
  aggregated?: {
    availableToSell: number;
    warningLevel: number;
    availableOnHand: number;
    availableForBackorder?: number | null;
    unlimitedBackorder: boolean;
  } | null;
}

export interface StockDisplaySettings {
  stockLevelDisplay: 'DONT_SHOW' | 'SHOW' | 'SHOW_WHEN_LOW' | null;
  showOutOfStockMessage: boolean;
  defaultOutOfStockMessage: string;
  showBackorderAvailabilityPrompt: boolean;
  backorderAvailabilityPrompt: string | null;
  showBackorderMessage: boolean;
  showQuantityOnBackorder: boolean;
}

export interface StockDisplayData {
  stockLevelMessage: string;
  stockLevelStatus?: 'error' | 'success';
  backorderAvailabilityPrompt: string | null;
}

function getBackorderAvailabilityPrompt(
  settings: StockDisplaySettings,
  inventory: StockDisplayInventory,
) {
  const { showBackorderAvailabilityPrompt, backorderAvailabilityPrompt } = settings;
  const { availableForBackorder, unlimitedBackorder } = inventory.aggregated ?? {};

  return showBackorderAvailabilityPrompt &&
    backorderAvailabilityPrompt &&
    (!!availableForBackorder || unlimitedBackorder)
    ? backorderAvailabilityPrompt
    : null;
}

function getStockLevelMessage(
  stockQuantity: number | undefined,
  warningLevel: number | undefined,
  formatStock: (quantity: number) => string,
): Pick<StockDisplayData, 'stockLevelMessage' | 'stockLevelStatus'> {
  // Keep zero/unknown quantities and backorder-only availability on the existing path.
  if (stockQuantity !== undefined && stockQuantity > 0) {
    const isLowStock =
      warningLevel !== undefined && warningLevel > 0 && stockQuantity <= warningLevel;

    if (isLowStock && process.env.ENABLE_LOW_STOCK_MESSAGE === 'true') {
      return {
        stockLevelMessage: `ONLY ${stockQuantity} IN STOCK`,
        stockLevelStatus: 'error',
      };
    }

    if (!isLowStock && process.env.ENABLE_IN_STOCK_MESSAGE === 'true') {
      return {
        stockLevelMessage: 'IN STOCK',
        stockLevelStatus: 'success',
      };
    }
  }

  return { stockLevelMessage: formatStock(stockQuantity ?? 0) };
}

export function getStockDisplayData(
  inventory: StockDisplayInventory | null | undefined,
  settings: StockDisplaySettings | null | undefined,
  formatStock: (quantity: number) => string,
): StockDisplayData | null {
  if (!inventory || !settings) {
    return null;
  }

  const {
    showOutOfStockMessage,
    stockLevelDisplay,
    defaultOutOfStockMessage,
    showBackorderAvailabilityPrompt,
    showBackorderMessage,
    showQuantityOnBackorder,
  } = settings;

  if (!inventory.isInStock) {
    return showOutOfStockMessage
      ? { stockLevelMessage: defaultOutOfStockMessage, backorderAvailabilityPrompt: null }
      : null;
  }

  const { availableToSell, warningLevel, availableOnHand } = inventory.aggregated ?? {};

  if (stockLevelDisplay === 'DONT_SHOW') {
    return null;
  }

  const showsBackorderInfo =
    showBackorderAvailabilityPrompt || showBackorderMessage || showQuantityOnBackorder;
  const stockQuantity = showsBackorderInfo ? availableOnHand : availableToSell;

  if (!showsBackorderInfo && !stockQuantity) {
    return null;
  }

  if (stockLevelDisplay === 'SHOW_WHEN_LOW') {
    if (!warningLevel) {
      return null;
    }

    if (stockQuantity && stockQuantity > warningLevel) {
      return null;
    }
  }

  const availabilityMessage = getBackorderAvailabilityPrompt(settings, inventory);

  if (!availabilityMessage && stockQuantity === undefined) {
    return null;
  }

  return {
    ...getStockLevelMessage(stockQuantity, warningLevel, formatStock),
    backorderAvailabilityPrompt: availabilityMessage,
  };
}
