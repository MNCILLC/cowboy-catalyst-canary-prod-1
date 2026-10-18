import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getSharingUrl, parseSharingServices } from './social-sharing.ts';

test('only explicitly selected supported services render, with duplicates removed', () => {
  assert.deepEqual(parseSharingServices('["email","facebook","facebook","unknown"]'), [
    'facebook',
    'email',
  ]);
  for (const value of [undefined, '', '[]', '{}', 'null', 'invalid']) {
    assert.deepEqual(parseSharingServices(value), []);
  }
});

test('share URLs preserve reserved characters and use the canonical page and image', () => {
  const content = {
    url: 'https://shop.example/a?x=1&y=2',
    title: 'Gold & Silver + 100% ✨',
    image: 'https://cdn.example/pic.jpg?a=1&b=2',
  };
  const facebook = new URL(getSharingUrl('facebook', content)!);
  assert.equal(facebook.searchParams.get('u'), content.url);
  const twitter = new URL(getSharingUrl('twitter', content)!);
  assert.equal(twitter.searchParams.get('url'), content.url);
  assert.equal(twitter.searchParams.get('text'), content.title);
  const pinterest = new URL(getSharingUrl('pinterest', content)!);
  assert.equal(pinterest.searchParams.get('media'), content.image);
  assert.equal(pinterest.searchParams.get('description'), content.title);
  const email = new URL(getSharingUrl('email', content)!);
  assert.equal(email.searchParams.get('subject'), content.title);
  assert.equal(email.searchParams.get('body'), content.url);
  assert.equal(getSharingUrl('print', content), undefined);
  assert.equal(new URL(getSharingUrl('linkedin', content)!).searchParams.get('url'), content.url);
});
