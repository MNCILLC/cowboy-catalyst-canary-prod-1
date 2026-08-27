import { NextResponse } from 'next/server';

import { isLoggedIn } from '~/auth';
import { isWholesalePricingMessageEnabled } from '~/lib/wholesale-pricing';

export async function GET() {
  return NextResponse.json({
    showBanner: isWholesalePricingMessageEnabled && !(await isLoggedIn()),
  });
}
