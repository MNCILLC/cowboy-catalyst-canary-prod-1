import assert from 'node:assert/strict';
import { test } from 'node:test';

import { contactSectionSchema } from './schema.ts';

test('contact submissions require a valid email and a nonblank bounded message', () => {
  for (const input of [
    { email: 'bad-address', comments: 'Help please' },
    { email: 'shopper@example.com', comments: '   ' },
    { email: 'shopper@example.com', comments: 'x'.repeat(10001) },
  ])
    assert.equal(contactSectionSchema.safeParse(input).success, false);
});

test('optional name is supported and client-supplied destination fields are discarded', () => {
  assert.deepEqual(
    contactSectionSchema.parse({
      email: 'shopper@example.com',
      comments: ' Help please ',
      pageId: 999,
      recipient: 'other@example.com',
    }),
    {
      email: 'shopper@example.com',
      comments: 'Help please',
    },
  );
});
