const announce = (text) => {document.querySelector('#announce').textContent = text;};
async function copy(text, button) {
  try { await navigator.clipboard.writeText(text); const label=button.querySelector('span')||button; const old=label.textContent; label.textContent='Copied'; announce('Copied to clipboard'); setTimeout(()=>label.textContent=old,1800); }
  catch { announce('Could not copy. Select the address or command and copy it manually.'); }
}
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>copy(b.dataset.copy,b)));
const demo = document.querySelector('#live-demo');
const send = (type, extra = {}) => demo.contentWindow?.postMessage({type, ...extra}, location.origin);
document.querySelector('#theme-preview').addEventListener('click', e => {
  const button = e.currentTarget;
  const dark = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(dark));
  button.querySelector('span').textContent = dark ? 'Light' : 'Dark';
  send('zings:theme', {mode: dark ? 'dark' : 'light'});
});
// Render the demo at laptop width and scale it into the MacBook screen; phones get the real mobile layout.
const view = demo.parentElement;
const fit = () => {
  if (view.clientWidth < 600) { demo.style.cssText = ''; return; }
  const s = view.clientWidth / 1200;
  demo.style.transform = `scale(${s})`; demo.style.height = `${view.clientHeight / s}px`;
};
new ResizeObserver(fit).observe(view); fit();
document.querySelector('#reset-preview').addEventListener('click', () => send('zings:reset'));
window.addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== demo.contentWindow || e.data?.type !== 'zings:ready') return;
  send('zings:theme', {mode: document.querySelector('#theme-preview').getAttribute('aria-pressed') === 'true' ? 'dark' : 'light'});
});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), {threshold: 0.08, rootMargin: '0px 0px -24px 0px'});
  document.querySelectorAll('.section-head,.bento-card,.chips,.detail-shot,.mobile-copy,.device-stage,.hosting .wrap>*,.film video,.support-card').forEach(el => {
    el.classList.add('reveal-ready'); observer.observe(el);
  });
  reducedMotion.addEventListener('change', e => {
    if (e.matches) { observer.disconnect(); document.querySelectorAll('.reveal-ready').forEach(el => el.classList.add('is-visible')); }
  });
}
const progress = document.createElement('div'); progress.className = 'scroll-progress'; progress.setAttribute('aria-hidden', 'true'); document.body.append(progress);
const tabs=[...document.querySelectorAll('[role=tab]')];
function select(tab){tabs.forEach(b=>{b.setAttribute('aria-selected',String(b===tab));b.tabIndex=b===tab?0:-1;});const im=document.querySelector('#detail-image');im.src='/media/screenshots/'+tab.dataset.shot;im.alt=tab.dataset.alt;document.querySelector('#preview-panel').setAttribute('aria-labelledby',tab.id);}
tabs.forEach((b,i)=>{b.addEventListener('click',()=>select(b));b.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%tabs.length;if(e.key==='ArrowLeft')n=(i+tabs.length-1)%tabs.length;if(e.key==='Home')n=0;if(e.key==='End')n=tabs.length-1;if(n!==undefined){e.preventDefault();select(tabs[n]);tabs[n].focus();}});});

// Bento backgrounds and terminal (ports of Magic UI's AnimatedList, typing input and Terminal).
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const onView = (el, fn) => { if (!el) return; if (!('IntersectionObserver' in window)) return fn(); const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { o.disconnect(); fn(); } }, {threshold: .3}); o.observe(el); };
const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };

const tasks = [['Review homepage hero with Sam','#2f80ed','meeting'],['Write Q4 goals draft','#8b5cf6','deep work'],['Book flights to Lisbon','#ec4899','Due today'],['Call Mom','#6366f1','Evening'],['Easy 5 km run','#12be7f','Tue, Thu, Sat'],['Finish slide deck for DevDays','#f59e0b','2 days left']];
const list = document.querySelector('#anim-list');
if (list) {
  let i = 0;
  const add = () => { const [t, c, tag] = tasks[i++ % tasks.length]; const li = h('li'); const dot = h('span', 'proj'); dot.style.background = c; li.append(h('span', 'box'), h('span', '', t), dot, h('span', 'tag', tag)); list.prepend(li); while (list.children.length > 5) list.lastElementChild.remove(); };
  if (still) for (let n = 0; n < 4; n++) add(); else { add(); setInterval(add, 1600); }
}

const phrases = [['Call mom tomorrow 6pm #family', ['Tomorrow 18:00', 'family']], ['Pay rent every month on the 1st', ['Every month', 'Day 1']], ['Zavolat Pavlovi v pátek odpoledne', ['Friday', 'Afternoon']], ['Gym every Tue, Thu and Sat 7am', ['Repeats', 'Tue, Thu, Sat', '07:00']]];
const nlText = document.querySelector('#nl-text'), nlChips = document.querySelector('#nl-chips');
if (nlText) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const run = async () => { for (let k = 0; ; k = (k + 1) % phrases.length) { const [text, chips] = phrases[k]; nlChips.replaceChildren(); for (let c = 1; c <= text.length; c++) { nlText.textContent = text.slice(0, c); await sleep(45); } for (const chip of chips) { nlChips.append(h('span', '', chip)); await sleep(260); } await sleep(2200); } };
  if (still) { nlText.textContent = phrases[0][0]; phrases[0][1].forEach(c => nlChips.append(h('span', '', c))); } else onView(nlText, run);
}

const cal = document.querySelector('#mini-cal');
if (cal) {
  ['M','T','W','T','F','S','S'].forEach(d => cal.append(h('span', 'dow', d)));
  for (let n = 0; n < 3; n++) cal.append(h('span'));  // October 2026 starts on a Thursday
  for (let d = 1; d <= 31; d++) cal.append(h('span', d === 25 ? 'today' : [6, 9, 13, 20, 22, 27, 29].includes(d) ? 'ev' : '', String(d)));
}

const term = document.querySelector('#terminal');
if (term && !still) {
  const typed = term.querySelector('.t-type'), lines = [...term.querySelectorAll('.t-line')], full = typed.dataset.text;
  term.classList.add('armed'); typed.textContent = '';
  onView(term, () => {
    let c = 0;
    const type = setInterval(() => {
      typed.textContent = full.slice(0, ++c);
      if (c < full.length) return;
      clearInterval(type);
      lines.forEach((l, n) => setTimeout(() => l.classList.add('on'), 400 + n * 450));
    }, 28);
  });
}
document.querySelectorAll('.marquee-track').forEach(t => t.append(...[...t.children].map(n => n.cloneNode(true))));
