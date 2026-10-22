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

const links = new Map([...document.querySelectorAll('[data-for]')].map(a => [a.dataset.for, a]));
const spy = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(a => a.classList.remove('active'));
    links.get(e.target.id)?.classList.add('active');
  });
}, { rootMargin: '-45% 0px -45% 0px' });
document.querySelectorAll('.piece').forEach(el => spy.observe(el));

const start = () => requestAnimationFrame(() => document.documentElement.classList.add('loaded'));
document.fonts ? document.fonts.ready.then(start) : window.addEventListener('load', start);
