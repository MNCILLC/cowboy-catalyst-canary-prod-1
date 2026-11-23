'use client';

import { createContext, type PropsWithChildren, useContext } from 'react';

const WarehouseAvailabilityScope = createContext('off');
const DisplayedWarehouseCart = createContext<string | undefined>(undefined);

export function AvailabilityScope({
  value,
  displayedCart,
  children,
}: PropsWithChildren<{ value: string; displayedCart?: string }>) {
  return (
    <WarehouseAvailabilityScope.Provider value={value}>
      <DisplayedWarehouseCart.Provider value={displayedCart}>
        {children}
      </DisplayedWarehouseCart.Provider>
    </WarehouseAvailabilityScope.Provider>
  );
}

export function useWarehouseAvailabilityKey() {
  return useContext(WarehouseAvailabilityScope);
}

export function DisplayedWarehouseCartField() {
  const cart = useContext(DisplayedWarehouseCart);

  return cart === undefined ? null : (
    <input name="displayedWarehouseCart" type="hidden" value={cart} />
  );
}
