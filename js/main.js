// Fallback recipient when the site is hosted statically (no backend): forms open the visitor's email app.
const CONTACT_EMAIL = 'razu220220@cseku.ac.bd';

/* ---------- tiny helpers (exposed as window.O) ---------- */
const O = window.O = {
  h(tag, attrs, ...kids) {           // safe DOM builder: text is never parsed as HTML
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => c != null && c !== false && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  },
  async api(path, method = 'GET', body) {
    const r = await fetch('/api' + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'orgiin' }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
    return j;
  },
  money: n => '৳' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }),
  date: d => new Date(d.replace(' ', 'T') + 'Z').toLocaleString(),
  cart: {
    get() { try { return JSON.parse(localStorage.getItem('orgiin_cart')) || []; } catch { return []; } },
    set(c) { try { localStorage.setItem('orgiin_cart', JSON.stringify(c)); } catch {} O.cartBadge(); },
    add(id, qty = 1) { const c = this.get(), i = c.find(x => x.id === id); i ? i.qty += qty : c.push({ id, qty }); this.set(c); },
    clear() { this.set([]); }
  },
  cartBadge() { const el = document.getElementById('cartCount'); if (el) el.textContent = O.cart.get().reduce((a, b) => a + b.qty, 0); },
  toast(msg, bad) { const t = O.h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg); document.body.append(t); setTimeout(() => t.remove(), 3500); },
  user: null,
  ready: null
};

/* ---------- UI chrome ---------- */
const yr = document.getElementById('yr'); if (yr) yr.textContent = new Date().getFullYear();
const nav = document.getElementById('nav'), burger = document.querySelector('.burger');
if (nav && burger) {
  burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
}
const toTop = document.querySelector('.totop');
if (toTop) addEventListener('scroll', () => toTop.classList.toggle('show', scrollY > 600), { passive: true });
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
O.reveal = root => (root || document).querySelectorAll('.reveal:not(.in)').forEach(el => io ? io.observe(el) : el.classList.add('in'));
O.reveal(); O.cartBadge();

/* ---------- auth state in the header ---------- */
O.ready = O.api('/auth/me').then(r => {
  O.user = r.user;
  const a = document.getElementById('authLink');
  if (a && r.user) { a.textContent = r.user.role === 'admin' ? 'Admin' : 'My account'; a.href = r.user.role === 'admin' ? 'admin.html' : 'account.html'; }
}).catch(() => { O.user = null; O.offline = true; });

/* ---------- dynamic team / jobs (falls back to static markup if no backend) ---------- */
const initials = n => n.trim()[0].toUpperCase();
function memberCard(m, i) {
  const lead = m.kind === 'leader';
  const ph = m.photo ? O.h('img', { src: m.photo, alt: m.name, loading: 'lazy' }) : O.h('div', { class: 'avatar' + (i % 2 ? ' g' : '') }, initials(m.name));
  return O.h('article', { class: 'member reveal' + (lead ? (/market/i.test(m.role) ? ' mkt' : ' lead') : '') }, O.h('div', { class: 'ph' }, ph),
    O.h('div', { class: 'info' }, O.h('h3', {}, m.name), O.h('span', { class: 'role' }, m.role), O.h('p', {}, m.bio)));
}
const teamEl = document.getElementById('team');
if (teamEl) O.api('/team').then(list => {
  const grids = teamEl.querySelectorAll('.team-grid'); if (grids.length < 2 || !list.length) return;
  grids[0].replaceChildren(...list.filter(m => m.kind === 'leader').map(memberCard));
  grids[1].replaceChildren(...list.filter(m => m.kind !== 'leader').map(memberCard));
  O.reveal(teamEl);
}).catch(() => {});

const jobsEl = document.getElementById('jobs');
if (jobsEl) O.api('/jobs').then(list => {
  jobsEl.replaceChildren(...list.map(j => O.h('div', { class: 'card job reveal', style: { '--c': '#4f7a52' } },
    O.h('div', {}, O.h('h3', {}, j.title), O.h('p', {}, j.description), O.h('span', { class: 'tag' }, j.location), O.h('span', { class: 'tag' }, 'Open')),
    O.h('a', { class: 'btn btn-dark', href: '#apply', 'data-role': j.title, onclick: () => { const s = document.getElementById('r'); if (s) s.value = j.title; } }, 'Apply'))));
  const sel = document.getElementById('r'); if (sel) sel.replaceChildren(...list.map(j => O.h('option', {}, j.title)));
  O.reveal(jobsEl);
}).catch(() => {});
document.querySelectorAll('[data-role]').forEach(a => a.addEventListener('click', () => { const s = document.getElementById('r'); if (s) s.value = a.dataset.role; }));

/* ---------- contact + career forms: post to API, or mailto when no backend ---------- */
[['orderForm', 'Orgiin enquiry', '/contact'], ['careerForm', 'Orgiin job application', '/apply']].forEach(([id, subj, ep]) => {
  const f = document.getElementById(id); if (!f) return;
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)), n = document.getElementById('formNote'), btn = f.querySelector('button');
    btn.disabled = true;
    try { await O.api(ep, 'POST', d); f.reset(); n.textContent = 'Thank you! We have received your message and will reply soon.'; n.className = 'note ok'; }
    catch (err) {
      if (err.status) { n.textContent = err.message; n.className = 'note err'; }
      else { location.href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(Object.entries(d).map(([k, v]) => k + ': ' + v).join('\n')); n.textContent = 'Your email app should open — just press send.'; n.className = 'note ok'; }
    }
    btn.disabled = false;
  });
});
