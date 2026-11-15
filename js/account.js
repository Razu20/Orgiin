(async () => {
  const { h, api, money, date } = O; await O.ready;
  if (!O.user) return location.href = 'login.html';
  if (O.user.role === 'admin') document.querySelector('.page-hero p').append(' ', h('a', { href: 'admin.html', style: { color: 'var(--turmeric)' } }, 'Open admin panel →'));
  const f = document.getElementById('profile'); f.name.value = O.user.name; f.phone.value = O.user.phone || ''; document.getElementById('pe').value = O.user.email;
  f.addEventListener('submit', async e => {
    e.preventDefault(); const m = document.getElementById('pmsg'), d = Object.fromEntries(new FormData(f));
    try { O.user = (await api('/account', 'PUT', d)).user; f.currentPassword.value = f.newPassword.value = ''; m.textContent = 'Saved'; m.className = 'note ok'; }
    catch (err) { m.textContent = err.message; m.className = 'note err'; }
  });
  document.getElementById('logout').addEventListener('click', async () => { await api('/auth/logout', 'POST'); location.href = 'index.html'; });
  const box = document.getElementById('orders');
  const load = async () => {
    const list = await api('/orders/mine');
    box.replaceChildren(...(list.length ? list.map(o => h('div', { class: 'ocard' },
      h('div', { class: 'ohead' }, h('b', {}, 'Order #' + o.id), h('span', { class: 'badge s-' + o.status }, o.status), h('span', { class: 'note' }, date(o.created_at))),
      h('ul', {}, o.items.map(i => h('li', {}, i.qty + ' × ' + i.name + ' — ' + money(i.price * i.qty)))),
      h('div', { class: 'ohead' }, h('b', {}, 'Total ' + money(o.total)),
        o.status === 'pending' && h('button', { class: 'btn btn-dark', style: { padding: '6px 16px' }, onclick: async () => { if (confirm('Cancel this order?')) { try { await api('/orders/' + o.id + '/cancel', 'POST'); load(); } catch (e) { O.toast(e.message, true); } } } }, 'Cancel order'))))
      : [h('p', {}, 'No orders yet. ', h('a', { href: 'shop.html', style: { color: 'var(--madder)', fontWeight: 600 } }, 'Visit the shop'))]));
  };
  load();
})();
