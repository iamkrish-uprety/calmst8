import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { verifyStripeSignature } from '../src/stripe.js';

const SECRET = 'whsec_test';

function makeEnv(overrides = {}) {
  const sent = [];
  const kv = new Map();
  return {
    sent, kv,
    env: {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: SECRET,
      OWNER_EMAIL: 'owner@calmst8.test',
      WAREHOUSE_EMAIL: 'warehouse@calmst8.test',
      FROM_EMAIL: 'orders@calmst8.test',
      SITE_URL: 'https://calmst8.test',
      EMAIL: { send: async m => { sent.push(m); return { messageId: String(sent.length) }; } },
      ORDERS: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } },
      ASSETS: { fetch: async () => new Response('asset') },
      ...overrides,
    },
  };
}

async function sign(payload, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  return `t=${t},v1=${[...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

const paidSession = {
  id: 'cs_test_abcDEF12345', object: 'checkout.session', livemode: false, created: 1760700000,
  payment_status: 'paid', payment_intent: 'pi_123', currency: 'gbp',
  amount_subtotal: 17000, amount_total: 17500, shipping_cost: { amount_total: 500 },
  metadata: { items: 'charcoal-hoodie:M:1|red-graphic-tee:L:2' },
  customer_details: { name: 'Sam Rivers', email: 'sam@example.com', phone: '+447700900000' },
  collected_information: { shipping_details: { name: 'Sam Rivers', address: { line1: '1 Test Street', city: 'London', postal_code: 'E1 1AA', country: 'GB' } } },
};

test('signature check accepts a valid signature and rejects tampering and stale timestamps', async () => {
  const body = '{"a":1}';
  assert.equal(await verifyStripeSignature(body, await sign(body), SECRET), true);
  assert.equal(await verifyStripeSignature(body + ' ', await sign(body), SECRET), false);
  assert.equal(await verifyStripeSignature(body, await sign(body, 'whsec_other'), SECRET), false);
  assert.equal(await verifyStripeSignature(body, await sign(body, SECRET, 1000), SECRET), false);
  assert.equal(await verifyStripeSignature(body, null, SECRET), false);
});

test('checkout builds a Stripe session from catalogue prices, ignoring prices sent by the browser', async () => {
  const { env } = makeEnv();
  let captured;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { captured = { url, body: new URLSearchParams(init.body) }; return Response.json({ url: 'https://checkout.stripe.com/c/pay/x' }); };
  try {
    const res = await worker.fetch(new Request('https://calmst8.test/api/checkout', {
      method: 'POST', body: JSON.stringify({ items: [{ id: 'charcoal-hoodie', size: 'M', qty: 2, price: 1 }] }),
    }), env);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).url, 'https://checkout.stripe.com/c/pay/x');
    assert.equal(captured.url, 'https://api.stripe.com/v1/checkout/sessions');
    assert.equal(captured.body.get('line_items[0][price_data][unit_amount]'), '6500');
    assert.equal(captured.body.get('line_items[0][quantity]'), '2');
    assert.equal(captured.body.get('shipping_address_collection[allowed_countries][0]'), 'GB');
    assert.equal(captured.body.get('metadata[items]'), 'charcoal-hoodie:M:2');
    assert.match(captured.body.get('success_url'), /^https:\/\/calmst8\.test\/success\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  } finally { globalThis.fetch = realFetch; }
});

test('checkout rejects unknown products, bad sizes and silly quantities', async () => {
  const { env } = makeEnv();
  for (const item of [{ id: 'nope', size: 'M', qty: 1 }, { id: 'charcoal-hoodie', size: 'XXXL', qty: 1 }, { id: 'charcoal-hoodie', size: 'M', qty: 99 }]) {
    const res = await worker.fetch(new Request('https://calmst8.test/api/checkout', { method: 'POST', body: JSON.stringify({ items: [item] }) }), env);
    assert.equal(res.status, 400);
  }
  const empty = await worker.fetch(new Request('https://calmst8.test/api/checkout', { method: 'POST', body: '{"items":[]}' }), env);
  assert.equal(empty.status, 400);
});

test('paid webhook emails owner, warehouse and customer once, even when Stripe retries', async () => {
  const { env, sent, kv } = makeEnv();
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: paidSession } });
  const call = async () => worker.fetch(new Request('https://calmst8.test/api/stripe-webhook', {
    method: 'POST', body: payload, headers: { 'Stripe-Signature': await sign(payload) },
  }), env);

  assert.equal((await call()).status, 200);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map(m => m.to), ['owner@calmst8.test', 'warehouse@calmst8.test', 'sam@example.com']);
  assert.match(sent[0].subject, /^New order C8-\d{6}-12345: 3 items, £175\.00$/);
  assert.match(sent[0].text, /1 × Washed hoodie, Charcoal, size M/);
  assert.match(sent[0].text, /2 × Graphic tee, Black, red print, size L/);
  assert.match(sent[1].text, /1 Test Street/);
  assert.doesNotMatch(sent[1].text, /£/, 'warehouse copy has no prices');
  assert.match(sent[2].text, /about 2 weeks/);
  assert.ok(kv.has(paidSession.id));

  assert.equal((await call()).status, 200);
  assert.equal(sent.length, 3, 'retry does not send again');
});

test('without a warehouse address the owner is told to forward the order', async () => {
  const { env, sent } = makeEnv({ WAREHOUSE_EMAIL: '' });
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: paidSession } });
  await worker.fetch(new Request('https://calmst8.test/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'Stripe-Signature': await sign(payload) } }), env);
  assert.deepEqual(sent.map(m => m.to), ['owner@calmst8.test', 'sam@example.com']);
  assert.match(sent[0].text, /Forward this email to the warehouse/);
});

test('webhook rejects bad signatures and ignores unpaid sessions', async () => {
  const { env, sent } = makeEnv();
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { ...paidSession, payment_status: 'unpaid' } } });
  const bad = await worker.fetch(new Request('https://calmst8.test/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'Stripe-Signature': 't=1,v1=00' } }), env);
  assert.equal(bad.status, 400);
  const unpaid = await worker.fetch(new Request('https://calmst8.test/api/stripe-webhook', { method: 'POST', body: payload, headers: { 'Stripe-Signature': await sign(payload) } }), env);
  assert.equal(unpaid.status, 200);
  assert.equal(sent.length, 0);
});

test('config reports whether checkout is available', async () => {
  const on = await worker.fetch(new Request('https://calmst8.test/api/config'), makeEnv().env);
  assert.deepEqual(await on.json(), { checkout: true });
  const off = await worker.fetch(new Request('https://calmst8.test/api/config'), makeEnv({ STRIPE_SECRET_KEY: '' }).env);
  assert.deepEqual(await off.json(), { checkout: false });
});
