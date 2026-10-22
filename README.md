# CALMST8 online shop

The CALMST8 website comes in two versions with the same design.

**Recommended: B. Shopify.** CALMST8 is a dropshipping store, and Shopify can send each order to the supplier, sync tracking numbers and handle returns. The products already exist in the CALMST8 Shopify store (`calmst8-3.myshopify.com`), so the theme can go straight onto it. Version A stays in the repo as a lower-cost fallback.

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

## Before launch: things to confirm with the owner

Products, prices, descriptions and photos now come from the existing Shopify store: 6 pieces, £29.99–£44.99, with £2.99 UK delivery.

- [ ] **Sizes.** Heaven Wash Cross Jeans and the Members Only tee have S–XL on the old store. Obsidian Cross Jeans, both hoodies and the Self Love tee have no sizes there, so S–XL is assumed for them as well.
- [ ] **Delivery time.** The site says "about 2 weeks", as the owner asked. The old store's shipping policy and FAQ say 4–10 business days. Update the policy to match.
- [ ] **Instagram handle.** This site links to `@calmst8.world`, but the old store's footer says `@calmst8`. Use one everywhere.
- [ ] **Self Love tee sale price.** On the old store its "compare at" price (£24.99) is lower than its price (£29.99). It should be higher, or empty.
- [ ] **Supplier.** Who ships the orders, and the email or app to connect (see section B).
- [ ] **Policies.** The footer pages are copied from the old store. Check they match the dropshipping supplier's terms.
- [ ] **Privacy policy contact.** The privacy policy (copied as written) lists a personal Gmail address and a Coventry postcode as the data-controller contact. Consider using help@calmst8.com and a business address instead.
- [ ] **Privacy policy wording for version A.** It says the store is "powered by Shopify". If version A launches instead, it should name Stripe and Cloudflare.

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
- **Footer pages** (About, FAQ, Contact, policies): edit `content/pages/*.html`, then run `npm run pages`. This rebuilds the pages and the shared footer.
- **After editing `styles.css`, `main.js` or `motion.js`:** run `npm run pages` too. It updates the `?v=` version tags on every page so visitors' browsers load the new files instead of old cached copies.
- **Tests:** `npm test`.
- **Local run:** `npx wrangler dev`. Put test keys in `.dev.vars`, which git ignores.

---

## B. Shopify

1. Build the theme file with `npm run theme:zip`. This creates `calmst8-theme.zip`.
2. In the existing store's admin (`calmst8-3`), go to **Online Store → Themes → Add theme → Upload zip file**. Preview it, then publish when happy. The old theme stays saved, so you can switch back at any time.
3. **Products** are already there. For each one:
   - Give it one option called **Size** (S, M, L, XL). Four products have no sizes yet.
   - Set **Product type** to Jeans, Hoodie or T-shirt. This is the small label above the name.
   - Put the flat-lay photo first. The worn photo shows on hover, or by swiping on phones.
4. **Colour line under the name:** in Settings → Custom data → Products, add a metafield `custom.colour` (single line text). Fill it in: Washed blue, Washed black, Charcoal, Umber, Black, Black.
5. **Dropshipping stock:** on each variant, untick **Track quantity**, or tick **Continue selling when out of stock**, unless the supplier app syncs stock.
6. **Send orders to the supplier.** Choose the option that fits:
   - **One manufacturer:** Settings → Locations → add a **fulfilment service** with the supplier's email. Assign the products to it. Shopify emails each order to them, and they reply with tracking.
   - **Print-on-demand tees:** connect Printful or Printify.
   - **AliExpress or Alibaba:** connect DSers.
7. **UK delivery:** the £2.99 rate already exists. Set its transit time to match the supplier.
8. **Emails:**
   - Owner: order emails are on by default.
   - Customer: Shopify sends the order confirmation, and a shipping email with tracking once the supplier ships.
   - Add the delivery time to the **Order confirmation** template.
9. **Shop Pay ("Buy with Shop"):** go to Settings → Payments, turn on **Shopify Payments**, then tick **Shop Pay**. The theme shows the Shop Pay button on product pages (once a size is picked), in the bag and on the cart page. Apple Pay and Google Pay appear in the same place if they're enabled.
10. **Theme editor:** pick the hero photos, the detail photos and the home page collection. The delivery wording is in Theme settings → Shop.

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
