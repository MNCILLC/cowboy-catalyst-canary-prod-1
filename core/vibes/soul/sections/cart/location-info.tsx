import { MapPin } from 'lucide-react';

interface Props {
  location: { label: string; name: string; address?: string };
  totalItemsLabel: string;
  totalQuantity: number;
}

export function LocationInfo({ location, totalItemsLabel, totalQuantity }: Props) {
  return (
    <div
      aria-atomic="true"
      className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"
      role="status"
    >
      <MapPin aria-hidden="true" className="shrink-0" size={20} />
      <div className="min-w-0 flex-1 break-words">
        <p>
          {location.label}: <span className="font-semibold">{location.name}</span>
        </p>
        {!!location.address && <p className="mt-1 text-blue-900">{location.address}</p>}
      </div>
      <div className="ml-auto shrink-0 border-l border-blue-200 pl-4 text-right">
        <p className="text-xs">{totalItemsLabel}</p>
        <p className="text-lg font-semibold tabular-nums">{totalQuantity}</p>
      </div>
    </div>
  );
}
