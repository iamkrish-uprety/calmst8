/* CALMST8 motion: smooth scroll, slow reveals, hero depth, cursor label.
   Shared by the static site and the Shopify theme. Everything here is an
   enhancement: with reduced motion (or no JS) the page is complete without it. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

  if (reduce) {
    window.C8Motion = { refresh() {}, lenis: null };
    return;
  }
  root.classList.add('motion');

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.2 });
    const raf = time => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);

    // In-page links glide instead of jumping
    document.addEventListener('click', e => {
      const link = e.target.closest('a[href*="#"]');
      if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.hash.length < 2) return;
      const target = url.hash === '#top' ? 0 : document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -76, duration: 1.6 });
      history.pushState(null, '', url.hash);
    });

    // Stop the page scrolling behind an open dialog (the bag)
    $$('dialog').forEach(d => {
      d.setAttribute('data-lenis-prevent', '');
      new MutationObserver(() => (d.open ? lenis.stop() : lenis.start())).observe(d, { attributes: true, attributeFilter: ['open'] });
    });
  }

  /* ---------- Reveals ---------- */
  const WORDS = '.intro-big, .pieces-index h2, .details-head h2, .order-head h2, .doc h1, .thanks h1, .simple-page h1';
  const FADE = '.intro-small, .piece-tag > *, .index-list li, .index-note, .steps li, .order-actions, .detail figcaption, .foot-group, .doc-body > *, .doc > .label, .thanks > p, .thanks-items, .pieces-index > .label, .details-head > .label, .order-head > .label';
  const CURTAIN = '.piece-img, .detail';
  const LINES = '.piece-tag, .hero-foot, .pieces-index, .foot-links';

  function splitWords(el) {
    if (el.dataset.split) return;
    el.dataset.split = '1';
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const word = document.createElement('span');
            word.className = 'w';
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            word.append(inner);
            frag.append(word);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'BR') {
          walk(n);
        }
      });
    };
    walk(el);
  }

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });

  function tag(selector, type, prepare) {
    $$(selector).forEach(el => {
      if (el.dataset.reveal) return;
      el.dataset.reveal = type;
      prepare?.(el);
      io.observe(el);
    });
  }

  function refresh() {
    tag(WORDS, 'words', splitWords);
    tag(FADE, 'fade', el => {
      const index = [...el.parentElement.children].filter(c => c.matches(FADE)).indexOf(el);
      el.style.setProperty('--d', `${Math.min(index, 8) * 70}ms`);
    });
    tag(CURTAIN, 'curtain', el => {
      const curtain = document.createElement('span');
      curtain.className = 'curtain';
      curtain.setAttribute('aria-hidden', 'true');
      el.append(curtain);
    });
    tag(LINES, 'line');
    tag('.foot-mark', 'letters', el => {
      if (el.dataset.split) return;
      el.dataset.split = '1';
      el.innerHTML = [...el.textContent].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
    });
  }

  /* ---------- Scroll-linked: header, hero depth, parallax ---------- */
  const bar = document.querySelector('.bar');
  const mark = document.querySelector('.hero-mark');
  const looks = $$('.look img');
  const drift = [...$$('.detail-a img').map(el => [el, 0.05]), ...$$('.detail-b img').map(el => [el, -0.07])];
  let lastY = window.scrollY;
  let mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  function onFrame() {
    const y = window.scrollY;
    const vh = window.innerHeight;

    if (bar && !document.querySelector('dialog[open]')) {
      const goingDown = y > lastY + 2;
      const goingUp = y < lastY - 2;
      if (goingDown && y > vh * 0.6) bar.classList.add('away');
      else if (goingUp || y < 80) bar.classList.remove('away');
    }
    lastY = y;

    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;

    if (mark && y < vh * 1.3) {
      mark.style.translate = `${-mouse.x * 14}px ${y * 0.32}px`;
      mark.style.opacity = String(Math.max(0, 1 - y / (vh * 0.85)));
      looks.forEach((img, i) => {
        const depth = i === 1 ? 1 : 1.7;
        img.style.translate = `${mouse.x * 9 * depth}px ${-y * 0.07 * depth + mouse.y * 5}px`;
      });
    }

    drift.forEach(([el, speed]) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      el.style.translate = `0 ${((r.top + r.height / 2) - vh / 2) * speed}px`;
    });

    requestAnimationFrame(onFrame);
  }
  requestAnimationFrame(onFrame);

  if (finePointer && mark) {
    const hero = document.querySelector('.hero');
    hero.addEventListener('pointermove', e => {
      mouse.tx = (e.clientX / innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / innerHeight) * 2 - 1;
    });
    hero.addEventListener('pointerleave', () => { mouse.tx = 0; mouse.ty = 0; });
  }

  /* ---------- Cursor label over photos that have a worn view ---------- */
  if (finePointer) {
    const label = document.createElement('div');
    label.className = 'cursor-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = 'See it worn';
    document.body.append(label);
    let x = 0, y = 0, cx = 0, cy = 0, visible = false;
    document.addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      const over = Boolean(e.target.closest?.('.piece-img.has-alt'));
      if (over !== visible) { visible = over; label.classList.toggle('show', over); }
    }, { passive: true });
    const follow = () => {
      cx += (x - cx) * 0.18; cy += (y - cy) * 0.18;
      label.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
  }

  refresh();
  window.C8Motion = { refresh, lenis };
})();
