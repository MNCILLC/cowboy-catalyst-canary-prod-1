import { clsx } from 'clsx';
import { CircleCheck } from 'lucide-react';

export type ShowCrateFeaturesTextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';

interface Props {
  features: Array<{ id: string; value: string }>;
  className?: string;
  textSize?: ShowCrateFeaturesTextSize;
}

export function ShowCrateFeatures({ features, className, textSize = 'xs' }: Props) {
  if (features.length === 0) return null;

  return (
    <ul className={clsx('space-y-1', className)}>
      {features.map((feature) => (
        <li
          className={clsx(
            'flex items-start gap-3 leading-relaxed',
            {
              xs: 'text-xs',
              sm: 'text-sm',
              base: 'text-base',
              lg: 'text-lg',
              xl: 'text-xl',
              '2xl': 'text-2xl',
            }[textSize],
          )}
          key={feature.id}
        >
          <CircleCheck
            aria-hidden="true"
            className="mt-[0.333em] size-[1em] shrink-0 text-blue-700"
          />
          <span className="min-w-0 whitespace-pre-line break-words">{feature.value}</span>
        </li>
      ))}
    </ul>
  );
}
