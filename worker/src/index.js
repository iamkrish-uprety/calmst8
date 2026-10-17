import catalog from '../../public/products.json' with { type: 'json' };
import { createCheckoutSession, getCheckoutSession, verifyStripeSignature } from './stripe.js';
import { buildOrder, orderEmails } from './orders.js';

const MAX_LINES = 10;
const MAX_QTY = 5;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/config' && request.method === 'GET') {
        return json({ checkout: Boolean(env.STRIPE_SECRET_KEY) });
      }
      if (url.pathname === '/api/checkout' && request.method === 'POST') {
        return await checkout(request, env, url);
      }
      if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
        return await webhook(request, env);
      }
      if (url.pathname === '/api/order' && request.method === 'GET') {
        return await orderSummary(url, env);
      }
      if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(JSON.stringify({ msg: 'request failed', path: url.pathname, error: String(err?.message || err) }));
      return json({ error: 'Something went wrong.' }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};

// Cart in, Stripe Checkout URL out. Prices always come from the catalogue, never the browser.
async function checkout(request, env, url) {
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Online checkout is not set up yet.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'The bag could not be read.' }, 400); }
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return json({ error: 'Your bag is empty.' }, 400);
  if (items.length > MAX_LINES) return json({ error: `A single order can hold up to ${MAX_LINES} different items.` }, 400);

  const lines = [];
  for (const item of items) {
    const product = catalog.products.find(p => p.id === item?.id);
    const qty = Number(item?.qty);
    if (!product || !product.sizes.includes(item?.size) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return json({ error: 'One of the items in your bag is no longer available. Remove it and try again.' }, 400);
    }
    lines.push({ product, size: item.size, qty });
  }

  const origin = env.SITE_URL || url.origin;
  const session = await createCheckoutSession(env.STRIPE_SECRET_KEY, { catalog, lines, origin });
  return json({ url: session.url });
}

async function webhook(request, env) {
  const payload = await request.text();
  const valid = await verifyStripeSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return json({ error: 'Invalid signature' }, 400);

  const event = JSON.parse(payload);
  const paidEvent =
    (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') ||
    event.type === 'checkout.session.async_payment_succeeded';
  if (!paidEvent) return json({ received: true });

  const session = event.data.object;
  // Stripe retries webhooks; only email once per paid session.
  if (await env.ORDERS.get(session.id)) return json({ received: true, duplicate: true });

  const order = buildOrder(session, catalog);
  const emails = orderEmails(order, env);
  for (const message of emails) {
    await env.EMAIL.send(Object.fromEntries(Object.entries(message).filter(([, v]) => v !== undefined && v !== '')));
  }
  await env.ORDERS.put(session.id, JSON.stringify(order));
  console.log(JSON.stringify({ msg: 'order emailed', order: order.number, recipients: emails.length }));
  return json({ received: true });
}

// Powers the thank-you page. Session IDs are unguessable, and only the basics are returned.
async function orderSummary(url, env) {
  const id = url.searchParams.get('session_id') || '';
  if (!env.STRIPE_SECRET_KEY || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return json({ error: 'Order not found.' }, 404);
  const session = await getCheckoutSession(env.STRIPE_SECRET_KEY, id);
  if (!session || session.payment_status !== 'paid') return json({ error: 'Order not found.' }, 404);
  const order = buildOrder(session, catalog);
  return json({
    number: order.number,
    firstName: order.customer.name.split(' ')[0] || '',
    email: order.customer.email,
    items: order.items.map(i => ({ name: i.name, colour: i.colour, size: i.size, qty: i.qty })),
    total: order.totalFormatted,
    leadTime: catalog.leadTime,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
