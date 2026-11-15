(async () => {
  const { h, api, money } = O, box = document.getElementById('cartItems'), f = document.getElementById('checkout'), msg = document.getElementById('msg'), totalEl = document.getElementById('total');
  let products = [];
  try { products = await api('/products'); } catch { box.replaceChildren(h('p', { class: 'note err' }, 'Cannot reach the server.')); f.hidden = true; return; }
  await O.ready;
  const note = document.getElementById('loginNote');
  if (!O.user) { note.replaceChildren('Please ', h('a', { href: 'login.html?next=cart', style: { color: 'var(--madder)', fontWeight: 600 } }, 'log in or register'), ' to place your order.'); }
  else { f.name.value = O.user.name; f.phone.value = O.user.phone || ''; }
  const draw = () => {
    let cart = O.cart.get().filter(i => products.some(p => p.id === i.id)); O.cart.set(cart);
    if (!cart.length) { box.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Your cart is empty.'), h('a', { class: 'btn btn-primary', href: 'shop.html' }, 'Browse the shop'))); f.hidden = true; return; }
    f.hidden = false; let total = 0;
    box.replaceChildren(...cart.map(i => {
      const p = products.find(x => x.id === i.id); total += p.price * i.qty;
      const set = n => { const c = O.cart.get(), it = c.find(x => x.id === i.id); n = Math.max(0, Math.min(n, p.stock)); if (!n) c.splice(c.indexOf(it), 1); else it.qty = n; O.cart.set(c); draw(); };
      return h('div', { class: 'crow' }, h('div', { class: 'cdot', style: { background: p.color } }),
        h('div', { class: 'cname' }, h('b', {}, p.name), h('span', { class: 'note' }, money(p.price) + ' / ' + p.unit)),
        h('div', { class: 'cqty' }, h('button', { onclick: () => set(i.qty - 1), 'aria-label': 'Less' }, '−'), h('span', {}, i.qty), h('button', { onclick: () => set(i.qty + 1), 'aria-label': 'More' }, '+')),
        h('b', {}, money(p.price * i.qty)), h('button', { class: 'x', onclick: () => set(0), 'aria-label': 'Remove ' + p.name }, '✕'));
    }));
    totalEl.textContent = money(total);
  };
  draw();
  f.addEventListener('submit', async e => {
    e.preventDefault(); if (!O.user) return location.href = 'login.html?next=cart';
    const d = Object.fromEntries(new FormData(f)), btn = document.getElementById('place'); btn.disabled = true;
    try {
      const r = await api('/orders', 'POST', { ...d, items: O.cart.get() }); O.cart.clear();
      box.replaceChildren(h('div', { class: 'empty ok' }, h('h2', {}, 'Order #' + r.order.id + ' placed 🎉'), h('p', {}, 'Total ' + money(r.order.total) + '. We will contact you on ' + r.order.phone + ' to confirm.'), h('a', { class: 'btn btn-dark', href: 'account.html' }, 'View my orders')));
      f.hidden = true;
    } catch (err) { msg.textContent = err.message; msg.className = 'note err'; if (err.status === 401) location.href = 'login.html?next=cart'; }
    btn.disabled = false;
  });
})();
