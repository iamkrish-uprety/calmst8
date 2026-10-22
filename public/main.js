document.documentElement.classList.add('js');

const BAG_KEY = 'calmst8-bag';
const DM_URL = 'https://ig.me/m/calmst8.world';
let catalog = { products: [], currency: 'gbp', leadTime: '' };
let checkoutAvailable = false;

const $ = sel => document.querySelector(sel);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency: catalog.currency.toUpperCase(), minimumFractionDigits: pence % 100 ? 2 : 0 }).format(pence / 100);
const product = id => catalog.products.find(p => p.id === id);

/* ---------- Bag storage (per-browser convenience) ---------- */
function readBag() {
  try { return JSON.parse(localStorage.getItem(BAG_KEY)) || []; } catch { return []; }
}
function writeBag(bag) {
  try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch { /* storage unavailable: bag lasts for this visit */ }
  memoryBag = bag;
}
let memoryBag = readBag();
const bag = () => memoryBag.filter(line => product(line.id)?.sizes.includes(line.size));

/* ---------- Collection ---------- */
// Categories for the filter bar, in shop order (Jeans, Hoodies, T-shirts)
const CATEGORY_SLUG = { 'Jeans': 'jeans', 'Hoodie': 'hoodies', 'T-shirt': 't-shirts' };
const CATEGORY_LABEL = { 'Jeans': 'Jeans', 'Hoodie': 'Hoodies', 'T-shirt': 'T-shirts' };

function renderCollection() {
  const kinds = [...new Set(catalog.products.map(p => p.kind))];
  $('#filters').innerHTML = [
    `<button type="button" data-filter="all" aria-pressed="true">All<span class="n">${catalog.products.length}</span></button>`,
    ...kinds.map(k => `<button type="button" data-filter="${esc(CATEGORY_SLUG[k] || k)}" aria-pressed="false">${esc(CATEGORY_LABEL[k] || k)}<span class="n">${catalog.products.filter(p => p.kind === k).length}</span></button>`),
  ].join('');

  $('#grid').innerHTML = catalog.products.map(p => `
    <article class="card" id="${p.id}" data-cat="${esc(CATEGORY_SLUG[p.kind] || p.kind)}" aria-labelledby="${p.id}-name">
      <div class="piece-img${p.images.length > 1 ? ' has-alt' : ''}">
        ${p.images.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.name)}, ${esc(p.colour.toLowerCase())}${i ? ', worn' : ''}" loading="lazy">`).join('')}
      </div>
      <form class="card-info" data-id="${p.id}" novalidate>
        <div class="card-row">
          <h3 id="${p.id}-name">${esc(p.name)}</h3>
          <p class="price">${money(p.price)}</p>
        </div>
        <p class="card-colour">${esc(p.colour)}</p>
        <fieldset class="sizes">
          <legend>Size</legend>
          ${p.sizes.map(s => `<label class="size"><input type="radio" name="size" value="${esc(s)}"><span>${esc(s)}</span></label>`).join('')}
        </fieldset>
        <p class="size-error" role="alert"></p>
        <button class="add" type="submit">Add to bag <span aria-hidden="true">+</span></button>
        <details class="card-more"><summary>Details</summary><p>${esc(p.desc)}</p></details>
      </form>
    </article>`).join('');

  $('#filters').addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (btn) applyFilter(btn.dataset.filter);
  });
  document.querySelectorAll('.card-info').forEach(form => {
    form.addEventListener('change', () => { form.querySelector('.size-error').textContent = ''; });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const size = form.querySelector('input[name="size"]:checked')?.value;
      if (!size) {
        form.querySelector('.size-error').textContent = 'Choose a size first.';
        form.querySelector('input[name="size"]').focus();
        return;
      }
      addToBag(form.dataset.id, size);
      const button = form.querySelector('.add');
      button.classList.add('added');
      button.firstChild.textContent = 'Added to bag ';
      setTimeout(() => { button.classList.remove('added'); button.firstChild.textContent = 'Add to bag '; }, 1800);
    });
  });
}

function applyFilter(slug) {
  document.querySelectorAll('#filters [data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === slug)));
  document.querySelectorAll('.card').forEach(card => { card.hidden = slug !== 'all' && card.dataset.cat !== slug; });
  window.C8Motion?.refresh();
}

// Links like ./#jeans open the shop with that category selected
function filterFromHash() {
  const slug = location.hash.slice(1);
  if (!document.querySelector(`#filters [data-filter="${CSS.escape(slug)}"]`)) return;
  applyFilter(slug);
  document.getElementById('shop').scrollIntoView();
}
window.addEventListener('hashchange', filterFromHash);

/* ---------- Bag ---------- */
function addToBag(id, size) {
  const lines = bag();
  const existing = lines.find(l => l.id === id && l.size === size);
  if (existing) existing.qty = Math.min(5, existing.qty + 1);
  else lines.push({ id, size, qty: 1 });
  writeBag(lines);
  renderBag();
  const count = $('#bag-count');
  count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
  openBag();
}

function setQty(index, qty) {
  const lines = bag();
  if (qty < 1) lines.splice(index, 1); else lines[index].qty = Math.min(5, qty);
  writeBag(lines);
  renderBag();
}

function renderBag() {
  const lines = bag();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + product(l.id).price * l.qty, 0);
  $('#bag-count').textContent = count;
  $('#bag-open').setAttribute('aria-label', `Bag, ${count} ${count === 1 ? 'item' : 'items'}`);
  $('#bag-empty').hidden = lines.length > 0;
  $('#bag-foot').hidden = lines.length === 0;
  $('#bag-subtotal').textContent = money(subtotal);
  $('#bag-items').innerHTML = lines.map((l, i) => {
    const p = product(l.id);
    return `<li class="bag-item" style="--n:${i}">
      <img src="${esc(p.images[0])}" alt="" width="72" height="90">
      <div>
        <p class="bag-name">${esc(p.name)}</p>
        <p class="bag-meta">${esc(p.colour)} · Size ${esc(l.size)}</p>
        <div class="qty" role="group" aria-label="Quantity of ${esc(p.name)}, ${esc(p.colour)}">
          <button type="button" data-qty="${i}" data-step="-1" aria-label="${l.qty === 1 ? 'Remove' : 'One fewer'}">−</button>
          <span>${l.qty}</span>
          <button type="button" data-qty="${i}" data-step="1" aria-label="One more" ${l.qty >= 5 ? 'disabled' : ''}>+</button>
        </div>
      </div>
      <div class="bag-end">
        <p>${money(p.price * l.qty)}</p>
        <button type="button" class="bag-remove" data-remove="${i}">Remove</button>
      </div>
    </li>`;
  }).join('');
  $('#bag-error').innerHTML = '';
}

const dialog = $('#bag');
function openBag() { if (!dialog.open) dialog.showModal(); }
$('#bag-open').addEventListener('click', openBag);
$('#bag-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => {
  if (e.target === dialog) dialog.close();
  const q = e.target.closest('[data-qty]');
  if (q) setQty(Number(q.dataset.qty), bag()[Number(q.dataset.qty)].qty + Number(q.dataset.step));
  const r = e.target.closest('[data-remove]');
  if (r) setQty(Number(r.dataset.remove), 0);
});

$('#bag-checkout').addEventListener('click', async () => {
  const button = $('#bag-checkout');
  const error = $('#bag-error');
  if (!checkoutAvailable) {
    const summary = bag().map(l => `${l.qty} × ${product(l.id).name}, ${product(l.id).colour}, size ${l.size}`).join('; ');
    error.innerHTML = `Online checkout opens soon. To order now, <a href="${DM_URL}" target="_blank" rel="noopener">message @calmst8.world on Instagram</a> with: ${esc(summary)}.`;
    return;
  }
  button.disabled = true;
  button.firstChild.textContent = 'Opening secure checkout… ';
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: bag() }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) throw new Error(data.error || 'Checkout could not be opened.');
    window.location.href = data.url;
  } catch (err) {
    error.textContent = `${err.message} Try again, or message @calmst8.world on Instagram.`;
    button.disabled = false;
    button.firstChild.textContent = 'Check out ';
  }
});

/* ---------- Page behaviour ---------- */
// The header gets its backdrop once the hero has mostly scrolled away
const bar = document.querySelector('.bar');
const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.45);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// The hero entrance plays once the fonts are ready
const start = () => requestAnimationFrame(() => document.documentElement.classList.add('loaded'));
document.fonts ? document.fonts.ready.then(start) : window.addEventListener('load', start);

/* ---------- Boot ---------- */
(async () => {
  catalog = await fetch('products.json').then(r => r.json());
  $('#lead-note').textContent = catalog.placeholder
    ? `${catalog.leadTime} Prices shown are samples until launch.`
    : `${catalog.leadTime} UK delivery ${money(catalog.shipping.rates[0].amount)}.`;
  $('#bag-lead').textContent = catalog.leadTime;
  renderCollection();
  renderBag();
  window.C8Motion?.refresh();
  filterFromHash();
  if (location.hash === '#bag') openBag();
  // Checkout needs the backend; on a static preview (e.g. GitHub Pages) the bag falls back to Instagram.
  try {
    const res = await fetch('/api/config');
    checkoutAvailable = res.ok && (await res.json()).checkout === true;
  } catch { checkoutAvailable = false; }
})();
