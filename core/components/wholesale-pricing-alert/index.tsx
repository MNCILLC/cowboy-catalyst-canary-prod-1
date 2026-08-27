import { isWholesalePricingMessageEnabled } from '~/lib/wholesale-pricing';

import { WholesalePricingAlertPresentation } from './presentation';

interface Props {
  className?: string;
  isAuthenticated: boolean;
  redirectTo?: string;
}

export function WholesalePricingAlert({ className, isAuthenticated, redirectTo }: Props) {
  if (isAuthenticated || !isWholesalePricingMessageEnabled) {
    return null;
  }

  return <WholesalePricingAlertPresentation className={className} redirectTo={redirectTo} />;
}
