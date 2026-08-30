'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { LOCATION_COOKIE } from '~/lib/location';

const locationIdSchema = z.coerce.number().int().positive();

export async function switchLocation(locationId: number): Promise<void> {
  const id = locationIdSchema.parse(locationId);

  (await cookies()).set(LOCATION_COOKIE, String(id), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
