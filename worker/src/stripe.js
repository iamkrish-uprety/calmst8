// Minimal Stripe REST client: no SDK, just fetch and form encoding.
const API = 'https://api.stripe.com/v1';

export async function createCheckoutSession(secretKey, { catalog, lines, origin }) {
  const params = {
    mode: 'payment',
    success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#bag`,
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: true },
    shipping_address_collection: { allowed_countries: catalog.shipping.countries },
    shipping_options: catalog.shipping.rates.map(rate => ({
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: rate.label,
        fixed_amount: { amount: rate.amount, currency: catalog.currency },
        delivery_estimate: {
          minimum: { unit: 'business_day', value: rate.minBusinessDays },
          maximum: { unit: 'business_day', value: rate.maxBusinessDays },
        },
      },
    })),
    line_items: lines.map(({ product, size, qty }) => ({
      quantity: qty,
      price_data: {
        currency: catalog.currency,
        unit_amount: product.price,
        product_data: {
          name: `${product.name}, ${product.colour}`,
          description: `Size ${size}. ${catalog.leadTime}`,
          images: [new URL(product.image, origin + '/').href],
          metadata: { product_id: product.id, size },
        },
      },
    })),
    // Compact copy of the bag, so the order email never depends on Stripe's line item formatting.
    metadata: { items: lines.map(l => `${l.product.id}:${l.size}:${l.qty}`).join('|') },
    custom_text: { submit: { message: catalog.leadTime } },
  };
  return stripe(secretKey, 'POST', '/checkout/sessions', params);
}

export function getCheckoutSession(secretKey, id) {
  return stripe(secretKey, 'GET', `/checkout/sessions/${encodeURIComponent(id)}`);
}

async function stripe(secretKey, method, path, params) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? encode(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Stripe ${res.status}: ${data?.error?.message || 'request failed'}`);
  }
  return data;
}

// { a: { b: [ { c: 1 } ] } } -> a[b][0][c]=1
function encode(obj, prefix, out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') encode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

// Stripe-Signature: t=timestamp,v1=hex(hmac_sha256(secret, `${t}.${payload}`))
export async function verifyStripeSignature(payload, header, secret, toleranceSeconds = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k, v]));
  const signatures = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  const timestamp = Number(parts.t);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return signatures.some(sig => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
