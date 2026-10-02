import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestCheckoutHandoff } from './handoff-client.ts';
const cartId = '10000000-0000-4000-8000-000000000001';
const input = { cartId, channelId: 1895385, locationId: 3 };
const config = { apiOrigin: 'http://localhost:3010', secret: 'a'.repeat(64) };
const valid = {
  cartId,
  token: 'b'.repeat(43),
  intentId: '20000000-0000-4000-8000-000000000002',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
test('checkout handoff sends the secret only to the backend and returns only the scoped token', async () => {
  const result = await requestCheckoutHandoff(input, config, async (url, options) => {
    assert.equal(url, 'http://localhost:3010/api/integrations/checkout/intents');
    assert.equal(new Headers(options?.headers).get('authorization'), `Bearer ${config.secret}`);
    assert.equal(JSON.parse(String(options?.body)).fulfillmentType, 'shipping');
    return Response.json(valid);
  });
  assert.deepEqual(result, [{ key: 'ofo_location_token', value: valid.token }]);
  assert.equal(JSON.stringify(result).includes(config.secret), false);
});
test('handoff rejects another cart, stale tokens, and an unavailable backend', async () => {
  await assert.rejects(
    requestCheckoutHandoff(input, config, async () =>
      Response.json({ ...valid, cartId: valid.intentId }),
    ),
  );
  await assert.rejects(
    requestCheckoutHandoff(input, config, async () =>
      Response.json({ ...valid, expiresAt: '2020-01-01T00:00:00.000Z' }),
    ),
  );
  await assert.rejects(
    requestCheckoutHandoff(input, config, async () => new Response('Unavailable', { status: 503 })),
  );
});

test('handoff distinguishes unsupported pairs and low stock without exposing backend error text', async () => {
  for (const [code, expected] of [
    ['unsupported_cart', /not supported/],
    ['unsupported_location', /not approved/],
    ['stock_unavailable', /not have enough stock/],
    ['unknown_error', /could not confirm your checkout/],
  ] as const) {
    await assert.rejects(
      requestCheckoutHandoff(input, config, async () =>
        Response.json({ code, error: 'private-backend-details' }, { status: 409 }),
      ),
      (error: Error) =>
        expected.test(error.message) && !error.message.includes('private-backend-details'),
    );
  }
});
