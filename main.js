document.documentElement.classList.add('js');

const pieces = [
  { id: 'charcoal-hoodie', name: 'Washed hoodie', colour: 'Charcoal', kind: 'Hoodie', post: 'DWJllP_jPAE',
    desc: 'A relaxed hoodie with a washed finish. Shown with dark cross-detail trousers.' },
  { id: 'cross-denim', name: 'Cross-detail denim', colour: 'Faded blue', kind: 'Denim', post: 'DWcB03cjNlr',
    desc: 'Wide-leg denim with frayed cross appliqués down both legs.' },
  { id: 'brown-hoodie', name: 'Washed hoodie', colour: 'Earth brown', kind: 'Hoodie', post: 'DWUt3zAjORb',
    desc: 'A pullover hoodie with a washed finish and a front pocket. Shown with blue cross-detail denim.' },
  { id: 'red-graphic-tee', name: 'Graphic tee', colour: 'Black, red print', kind: 'Graphic tee', post: 'DWOoohyDOk_',
    desc: 'An oversized black tee with a large portrait graphic and red lettering across the back.' },
  { id: 'white-graphic-tee', name: 'Graphic tee', colour: 'Black, white print', kind: 'Graphic tee', post: 'DWE3_ouDChF',
    desc: 'A black tee with a monochrome portrait graphic and oversized white lettering across the back.' },
];

document.getElementById('index-list').innerHTML = pieces.map(p => `
  <li><a href="#${p.id}" data-for="${p.id}"><span class="n">${p.name}</span><span class="c">${p.colour}</span></a></li>`).join('');

document.getElementById('pieces-list').innerHTML = pieces.map(p => `
  <article class="piece reveal" id="${p.id}" aria-labelledby="${p.id}-name">
    <div class="piece-img">
      <img src="images/${p.id}.jpg" alt="${p.name} in ${p.colour.toLowerCase()}" loading="lazy">
    </div>
    <div class="piece-tag">
      <p class="label">${p.kind}</p>
      <h3 id="${p.id}-name">${p.name} <em>${p.colour}</em></h3>
      <p>${p.desc}</p>
      <a class="link" href="https://www.instagram.com/calmst8.world/p/${p.post}/" target="_blank" rel="noopener">See it on Instagram <span aria-hidden="true">↗</span></a>
    </div>
  </article>`).join('');

// Header gains a backdrop once the hero wordmark scrolls away
const bar = document.querySelector('.bar');
const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.45);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Fade pieces in as they arrive
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

document.getElementById('year').textContent = new Date().getFullYear();

const start = () => requestAnimationFrame(() => document.documentElement.classList.add('loaded'));
document.fonts ? document.fonts.ready.then(start) : window.addEventListener('load', start);
