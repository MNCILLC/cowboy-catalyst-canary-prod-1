'use client';

import { createContext, type PropsWithChildren, useContext } from 'react';

const WarehouseAvailabilityScope = createContext('off');

export function AvailabilityScope({ value, children }: PropsWithChildren<{ value: string }>) {
  return (
    <WarehouseAvailabilityScope.Provider value={value}>
      {children}
    </WarehouseAvailabilityScope.Provider>
  );
}

export function useWarehouseAvailabilityKey() {
  return useContext(WarehouseAvailabilityScope);
}
