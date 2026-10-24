document.documentElement.classList.add('js');

const C8 = window.CALMST8 || { root: '/', moneyFormat: '£{{amount}}' };
const $ = sel => document.querySelector(sel);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function money(cents) {
  const amount = (cents / 100).toFixed(2);
  return C8.moneyFormat.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) =>
    key === 'amount_no_decimals' ? Math.round(cents / 100).toLocaleString('en-GB') :
    key === 'amount_with_comma_separator' ? amount.replace('.', ',') : amount);
}

/* ---------- Bag drawer (Shopify AJAX cart API) ---------- */
const dialog = $('#bag');

async function cartRequest(path, body) {
  const res = await fetch(C8.root + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.description || data.message || 'The bag could not be updated.');
  return data;
}

function renderBag(cart) {
  $('#bag-count').textContent = cart.item_count;
  $('#bag-empty').hidden = cart.item_count > 0;
  $('#bag-foot').hidden = cart.item_count === 0;
  $('#bag-subtotal').textContent = money(cart.total_price);
  $('#bag-items').innerHTML = cart.items.map((item, i) => `
    <li class="bag-item" style="--n:${i}">
      ${item.image ? `<img src="${esc(item.image + (item.image.includes('?') ? '&' : '?') + 'width=160')}" alt="" width="72" height="90">` : '<span></span>'}
      <div>
        <p class="bag-name">${esc(item.product_title)}</p>
        <p class="bag-meta">${item.variant_title ? esc(item.options_with_values.map(o => `${o.name} ${o.value}`).join(' · ')) : ''}</p>
        <div class="qty" role="group" aria-label="Quantity of ${esc(item.product_title)}">
          <button type="button" data-line="${i + 1}" data-qty="${item.quantity - 1}" aria-label="${item.quantity === 1 ? 'Remove' : 'One fewer'}">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-line="${i + 1}" data-qty="${item.quantity + 1}" aria-label="One more">+</button>
        </div>
      </div>
      <div class="bag-end">
        <p>${money(item.final_line_price)}</p>
        <button type="button" class="bag-remove" data-line="${i + 1}" data-qty="0">Remove</button>
      </div>
    </li>`).join('');
  $('#bag-error').textContent = '';
}

async function refreshBag() { renderBag(await cartRequest('cart.js')); }
function openBag() { if (!dialog.open) dialog.showModal(); }

$('#bag-open')?.addEventListener('click', e => { e.preventDefault(); refreshBag().then(openBag).catch(() => { location.href = C8.cartUrl; }); });
$('#bag-close')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', async e => {
  if (e.target === dialog) return dialog.close();
  const btn = e.target.closest('[data-line]');
  if (!btn) return;
  try { renderBag(await cartRequest('cart/change.js', { line: Number(btn.dataset.line), quantity: Number(btn.dataset.qty) })); }
  catch (err) { $('#bag-error').textContent = err.message; }
});

document.querySelectorAll('[data-product-form]').forEach(form => {
  const error = form.querySelector('.size-error');
  form.addEventListener('change', () => {
    if (error) error.textContent = '';
    form.classList.toggle('has-size', Boolean(form.querySelector('input[name="id"]:checked')));
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const choice = form.querySelector('input[name="id"]:checked') || form.querySelector('input[type="hidden"][name="id"]');
    if (!choice) {
      error.textContent = 'Choose a size first.';
      form.querySelector('input[name="id"]:not(:disabled)')?.focus();
      return;
    }
    const button = form.querySelector('.add');
    button.disabled = true;
    try {
      await cartRequest('cart/add.js', { items: [{ id: Number(choice.value), quantity: 1 }] });
      await refreshBag();
      const count = $('#bag-count');
      count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
      button.classList.add('added');
      button.firstChild.textContent = 'Added to bag ';
      setTimeout(() => { button.classList.remove('added'); button.firstChild.textContent = 'Add to bag '; }, 1800);
      openBag();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
});

/* ---------- Page behaviour ---------- */
const bar = $('.bar');
if (bar && !bar.classList.contains('scrolled')) {
  const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.45);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Shop filters (by product type). Links like #hoodies, #t-shirts or #jeans open the shop filtered.
const singular = v => v.replace(/s$/, '');
function applyFilter(slug) {
  document.querySelectorAll('[data-filters]').forEach(group => {
    group.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === slug)));
    group.closest('.shop').querySelectorAll('.card').forEach(card => { card.hidden = slug !== 'all' && card.dataset.cat !== slug; });
  });
}
document.querySelectorAll('[data-filters]').forEach(group => {
  group.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]');
    if (btn) applyFilter(btn.dataset.filter);
  });
});
function filterFromHash() {
  const wanted = singular(decodeURIComponent(location.hash.slice(1)).toLowerCase());
  if (!wanted) return;
  const btn = [...document.querySelectorAll('[data-filters] [data-filter]')].find(b => singular(b.dataset.filter) === wanted);
  if (!btn) return;
  applyFilter(btn.dataset.filter);
  document.getElementById('shop')?.scrollIntoView();
}
window.addEventListener('hashchange', filterFromHash);
filterFromHash();

/* ---------- Film controls ---------- */
const film = document.querySelector('.hero-video');
const filmPlay = document.getElementById('film-play');
const filmSound = document.getElementById('film-sound');
if (film && filmPlay && filmSound) {
  const setPlaying = on => { filmPlay.textContent = on ? 'Pause' : 'Play'; filmPlay.setAttribute('aria-pressed', String(on)); };
  filmPlay.addEventListener('click', () => (film.paused ? film.play().catch(() => {}) : film.pause()));
  film.addEventListener('play', () => setPlaying(true));
  film.addEventListener('pause', () => setPlaying(false));
  filmSound.addEventListener('click', () => {
    film.muted = !film.muted;
    if (!film.muted && film.paused) film.play().catch(() => {});
    filmSound.textContent = film.muted ? 'Sound on' : 'Mute';
    filmSound.setAttribute('aria-pressed', String(!film.muted));
  });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { film.removeAttribute('autoplay'); film.pause(); setPlaying(false); }
}

/* ---------- Size guide and search dialogs ---------- */
document.querySelectorAll('.info-dialog').forEach(d => {
  d.querySelector('.dialog-close')?.addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
});
document.addEventListener('click', e => {
  if (e.target.closest('.fit-open')) document.getElementById('fit-dialog')?.showModal();
});

const searchDialog = document.getElementById('search-dialog');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchCatalog = null;
async function runSearch() {
  if (!searchCatalog) {
    try { searchCatalog = (await fetch(C8.root + 'products.json?limit=250').then(r => r.json())).products; }
    catch { searchCatalog = []; }
  }
  const q = searchInput.value.trim().toLowerCase();
  const found = searchCatalog.filter(p => !q || `${p.title} ${p.product_type} ${p.product_type === 'Jeans' ? 'denim' : ''} ${p.tags}`.toLowerCase().includes(q));
  searchResults.innerHTML = found.length
    ? found.map(p => {
        const img = p.images[0]?.src;
        const price = Math.min(...p.variants.map(v => Number(v.price))) * 100;
        return `<a href="${C8.root}products/${esc(p.handle)}">${img ? `<img src="${esc(img + (img.includes('?') ? '&' : '?') + 'width=160')}" alt="">` : ''}<span>${esc(p.title)}<br>${money(price)}</span></a>`;
      }).join('')
    : '<p class="search-result-empty">No pieces found. Try hoodie, tee or denim.</p>';
}
document.querySelectorAll('.search-open').forEach(btn => btn.addEventListener('click', () => {
  searchDialog.showModal();
  runSearch();
  searchInput.focus();
}));
searchInput?.addEventListener('input', runSearch);

// The hero entrance plays once the fonts are ready
const start = () => requestAnimationFrame(() => document.documentElement.classList.add('loaded'));
document.fonts ? document.fonts.ready.then(start) : window.addEventListener('load', start);
