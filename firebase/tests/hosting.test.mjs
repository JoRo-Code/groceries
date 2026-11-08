import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Hosting serves invitation fallback and Apple association without redirects', async () => {
  const base = 'http://127.0.0.1:8186';
  const invite = await fetch(`${base}/join/${'a'.repeat(72)}`, { redirect: 'manual' });
  assert.equal(invite.status, 200);
  assert.match(await invite.text(), /id="root"/);
  assert.equal(invite.headers.get('referrer-policy'), 'no-referrer');
  assert.match(invite.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const aasa = await fetch(`${base}/.well-known/apple-app-site-association`, { redirect: 'manual' });
  assert.equal(aasa.status, 200);
  assert.match(aasa.headers.get('content-type'), /application\/json/);
  const association = await aasa.json();
  assert.equal(association.applinks.details[0].components[0]['/'], '/join/*');
  const manifest = await fetch(`${base}/manifest.webmanifest`);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /json/);
});
