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
function renderCollection() {
  $('#index-list').innerHTML = catalog.products.map(p => `
    <li><a href="#${p.id}" data-for="${p.id}"><span class="n">${esc(p.name)}</span><span class="c">${esc(p.colour)}</span></a></li>`).join('');

  $('#pieces-list').innerHTML = catalog.products.map(p => `
    <article class="piece reveal" id="${p.id}" aria-labelledby="${p.id}-name">
      <div class="piece-media">
        <div class="piece-img${p.images.length > 1 ? ' has-alt' : ''}">
          ${p.images.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.name)}, ${esc(p.colour.toLowerCase())}${i ? ', worn' : ''}" loading="lazy">`).join('')}
        </div>
        ${p.images.length > 1 ? '<p class="swipe-hint label" aria-hidden="true">Swipe for more photos</p>' : ''}
      </div>
      <form class="piece-tag" data-id="${p.id}" novalidate>
        <p class="label">${esc(p.kind)}</p>
        <h3 id="${p.id}-name">${esc(p.name)} <em>${esc(p.colour)}</em></h3>
        <p class="price">${money(p.price)}</p>
        <p class="desc">${esc(p.desc)}</p>
        <fieldset class="sizes">
          <legend class="label">Size</legend>
          ${p.sizes.map(s => `<label class="size"><input type="radio" name="size" value="${esc(s)}"><span>${esc(s)}</span></label>`).join('')}
        </fieldset>
        <p class="size-error" role="alert"></p>
        <button class="add" type="submit">Add to bag <span aria-hidden="true">+</span></button>
        ${p.post ? `<a class="link" href="https://www.instagram.com/calmst8.world/p/${esc(p.post)}/" target="_blank" rel="noopener">See it on Instagram <span aria-hidden="true">↗</span></a>` : ''}
      </form>
    </article>`).join('');

  document.querySelectorAll('.piece-tag').forEach(form => {
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
    });
  });
}

/* ---------- Bag ---------- */
function addToBag(id, size) {
  const lines = bag();
  const existing = lines.find(l => l.id === id && l.size === size);
  if (existing) existing.qty = Math.min(5, existing.qty + 1);
  else lines.push({ id, size, qty: 1 });
  writeBag(lines);
  renderBag();
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
    return `<li class="bag-item">
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
const bar = document.querySelector('.bar');
const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.45);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

function watchPieces() {
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.reveal').forEach(el => reveal.observe(el));

  // Highlight the piece in the index that is in the middle of the screen
  const links = new Map([...document.querySelectorAll('[data-for]')].map(a => [a.dataset.for, a]));
  const spy = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.remove('active'));
      links.get(e.target.id)?.classList.add('active');
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  document.querySelectorAll('.piece').forEach(el => spy.observe(el));
}


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
  watchPieces();
  if (location.hash === '#bag') openBag();
  // Checkout needs the backend; on a static preview (e.g. GitHub Pages) the bag falls back to Instagram.
  try {
    const res = await fetch('/api/config');
    checkoutAvailable = res.ok && (await res.json()).checkout === true;
  } catch { checkoutAvailable = false; }
})();
