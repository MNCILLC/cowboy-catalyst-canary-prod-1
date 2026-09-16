import { NextRequest, NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';
import { z } from 'zod';

import {
  getBestSellingProducts,
  getCategoryProducts,
  getFeaturedProducts,
  getNewestProducts,
} from '~/client/queries/get-products';
import { routing } from '~/i18n/routing';

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ group: string }> },
) => {
  const { group } = await params;
  const searchParams = request.nextUrl.searchParams;
  const locale = searchParams.get('locale') ?? routing.defaultLocale;

  if (!hasLocale(routing.locales, locale)) {
    return NextResponse.json(
      { status: 'error', error: 'Invalid locale parameter' },
      { status: 400 },
    );
  }

  const querySchema = z
    .object({
      group: z.enum(['best-selling', 'featured', 'newest', 'category']),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      categoryId: z.coerce.number().int().positive().optional(),
    })
    .refine((value) => value.group !== 'category' || value.categoryId !== undefined);

  const parseResult = querySchema.safeParse({
    group,
    limit: searchParams.get('limit') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      { status: 'error', error: 'Invalid group, limit, or categoryId parameter' },
      { status: 400 },
    );
  }

  let result;
  const { limit, categoryId } = parseResult.data;

  switch (parseResult.data.group) {
    case 'best-selling':
      result = await getBestSellingProducts({ locale, limit });
      break;

    case 'featured':
      result = await getFeaturedProducts({ locale, limit });
      break;

    case 'newest':
      result = await getNewestProducts({ locale, limit });
      break;

    case 'category':
      if (categoryId === undefined) {
        return NextResponse.json(
          { status: 'error', error: 'categoryId is required' },
          { status: 400 },
        );
      }

      result = await getCategoryProducts({ categoryId, locale, limit });
      break;
  }

  return NextResponse.json(result);
};
