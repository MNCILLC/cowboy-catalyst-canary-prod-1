import { clsx } from 'clsx';
import { CircleCheck } from 'lucide-react';

interface Props {
  features: Array<{ id: string; value: string }>;
  className?: string;
}

export function ShowCrateFeatures({ features, className }: Props) {
  if (features.length === 0) return null;

  return (
    <ul className={clsx('space-y-1', className)}>
      {features.map((feature) => (
        <li className="flex items-start gap-3 text-xs leading-relaxed" key={feature.id}>
          <CircleCheck aria-hidden="true" className="mt-1 size-3 shrink-0 text-blue-700" />
          <span className="min-w-0 whitespace-pre-line break-words">{feature.value}</span>
        </li>
      ))}
    </ul>
  );
}
