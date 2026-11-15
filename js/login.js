(async () => {
  const { api } = O, p = new URLSearchParams(location.search), next = p.get('next');
  const go = u => location.href = u.role === 'admin' ? 'admin.html' : next === 'cart' ? 'cart.html' : 'account.html';
  await O.ready; if (O.user) return go(O.user);
  const L = document.getElementById('loginForm'), R = document.getElementById('regForm');
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t)); L.hidden = t.dataset.t !== 'login'; R.hidden = t.dataset.t !== 'register'; }));
  const bind = (form, ep, out) => form.addEventListener('submit', async e => {
    e.preventDefault(); const m = document.getElementById(out); m.textContent = '';
    try { go((await api(ep, 'POST', Object.fromEntries(new FormData(form)))).user); } catch (err) { m.textContent = err.message; }
  });
  bind(L, '/auth/login', 'lmsg'); bind(R, '/auth/register', 'rmsg');
})();
