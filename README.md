# CALMST8 online shop

The CALMST8 website comes in two versions with the same design. Pick one to launch.

| | **A. Stripe + Cloudflare** (`public/` + `worker/`) | **B. Shopify** (`shopify-theme/`) |
|---|---|---|
| Monthly cost | Free hosting (Cloudflare free plan) | Shopify plan, from about $39/month |
| Card fees | Stripe, about 1.5% + 20p for UK cards | Shopify Payments, similar |
| Order admin | Stripe dashboard, plus the order emails | Shopify admin (orders, refunds, customers, fulfilment apps) |
| Changing products | Edit `public/products.json` and redeploy | Shopify admin, no code |
| Best if | You want low running costs and few products | The owner wants to run everything from an admin panel |

Both versions work the same way for customers:

1. The customer picks a piece and a size, adds it to the bag and pays at checkout.
2. The owner gets the order receipt by email.
3. The warehouse gets a production copy with the delivery address. This happens automatically, or the owner forwards the receipt.
4. The customer gets a confirmation saying the order is made to order and arrives in about 2 weeks.

**Preview:** https://iamkrish-uprety.github.io/calmst8/ shows the design only. Checkout needs version A deployed to Cloudflare, so in the preview the bag falls back to ordering by Instagram message.

---

## Before launch: things only the owner can provide

- [ ] **Final prices and sizes.** The current ones in `public/products.json` are samples, and the site says so.
- [ ] **High-resolution photos.** Ideally 2000 px tall or more, full-length, on the same light grey studio background. The design blends that background into the page.
- [ ] **Owner email**, and the **warehouse email** if order copies should go there automatically.
- [ ] **UK delivery price.** £5 is a placeholder.
- [ ] **Policy pages:** delivery, returns for made-to-order items, privacy and terms. A UK shop needs these.

---

## A. Stripe + Cloudflare

### How it works

```
Customer ── bag ──> /api/checkout ──> Stripe Checkout (card payment, UK address, delivery estimate)
                                           │
                       payment succeeds ───┘
                                           ▼
                    /api/stripe-webhook ──> email: owner (receipt)
                                        ├─> email: warehouse (production copy, no prices)
                                        └─> email: customer (confirmation, about 2 weeks)
```

- Prices come only from `public/products.json` on the server. The browser cannot change them.
- Stripe signs every payment notification, and the backend rejects anything it can't verify.
- Each order is emailed once, even if Stripe resends the notification.

### Set up (about 30 minutes)

You need Node 18+ and a Cloudflare account. Run `npm install` once.

1. **Stripe.** The owner signs up at stripe.com and adds their business and bank details. Copy the **secret key** from Developers → API keys. Start with the test key (`sk_test_…`).
2. **Domain and email.** Add the shop's domain (for example `calmst8.world`) to Cloudflare, then turn on email sending:
   ```bash
   npx wrangler email sending enable calmst8.world
   ```
3. **Order store.** Create the store that stops duplicate emails:
   ```bash
   npx wrangler kv namespace create ORDERS
   ```
   Paste the `id` it prints into `wrangler.jsonc`.
4. **Settings.** In `wrangler.jsonc`, set `OWNER_EMAIL`, `FROM_EMAIL` (on the domain from step 2), `SITE_URL`, and optionally `WAREHOUSE_EMAIL`.
5. **Deploy:**
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler deploy
   ```
6. **Payment notifications.** In Stripe, go to Developers → Webhooks → Add endpoint. Set the URL to `https://YOUR-SITE/api/stripe-webhook` and choose the events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the signing secret, then:
   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
7. **Test order.** Pay with card `4242 4242 4242 4242`, any future date and any CVC. Check that all three emails arrive and are marked TEST.
8. **Go live.** Replace both secrets with the live key and a live webhook secret. Then set real prices and `"placeholder": false` in `products.json`, and deploy again.

### Day-to-day changes

- **Prices, sizes, new products:** edit `public/products.json` (prices are in pence), then run `npx wrangler deploy`.
- **New photos:** put them in `public/images/` and update `image` in `products.json`.
- **Shipping worldwide:** add country codes to `shipping.countries` (for example `"IE", "FR", "US"`) and add a rate for each region in `shipping.rates`.
- **Tests:** `npm test`.
- **Local run:** `npx wrangler dev`. Put test keys in `.dev.vars`, which git ignores.

---

## B. Shopify

1. Build the theme file with `npm run theme:zip`. This creates `calmst8-theme.zip`.
2. In Shopify admin, go to **Online Store → Themes → Add theme → Upload zip file**, then publish it.
3. **Products:** add each piece with one option called **Size**, one variant per size. Set **Product type** to Hoodie, Denim or Graphic tee.
4. **Colour line under the name:** in Settings → Custom data → Products, add a metafield `custom.colour` (single line text) and fill it in for each product.
5. **Made to order:** on each variant, untick **Track quantity**, or tick **Continue selling when out of stock**.
6. **UK delivery:** in Settings → Shipping and delivery, create a UK zone with one rate. For the delivery time, set the rate's transit time to about 2 weeks.
7. **Order emails:**
   - Owner: this is on by default (Settings → Notifications → Staff notifications).
   - Warehouse: add the warehouse email as a staff notification recipient for **New order**.
   - Customer: edit **Order confirmation** to add "Made to order. Delivered in about 2 weeks."
8. **Theme editor:** pick the hero photos, the detail photos and the collection shown on the home page. The delivery wording is in Theme settings → Shop.

---

## Files

```
public/            Website (Stripe version, also the GitHub Pages preview)
  products.json    Products, prices, sizes, delivery settings
  success.html     Thank-you page after payment
worker/src/        Checkout backend (Cloudflare Worker)
worker/test/       Backend tests (npm test)
shopify-theme/     Shopify version of the same design
wrangler.jsonc     Cloudflare settings
```
