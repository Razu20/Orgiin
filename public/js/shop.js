(async () => {
  const { h, api, money } = O, grid = document.getElementById('products'), q = document.getElementById('q'), count = document.getElementById('count');
  let all = [];
  const card = p => {
    const qty = h('input', { type: 'number', min: 1, max: Math.max(p.stock, 1), value: 1, 'aria-label': 'Quantity', class: 'qty' });
    return h('article', { class: 'pcard reveal' },
      p.image ? h('img', { src: p.image, alt: p.name, loading: 'lazy' }) : h('div', { class: 'pimg', style: { background: `linear-gradient(135deg,${p.color},${p.color}99)` } }, h('span', {}, '🎨')),
      h('div', { class: 'pbody' }, h('span', { class: 'tag' }, p.category), h('h3', {}, p.name), h('p', {}, p.description),
        h('div', { class: 'pfoot' }, h('b', {}, money(p.price), h('small', {}, ' / ' + p.unit)), h('span', { class: 'note' }, p.stock > 0 ? p.stock + ' ' + p.unit + ' in stock' : 'Out of stock')),
        h('div', { class: 'padd' }, qty, h('button', { class: 'btn btn-primary', disabled: p.stock < 1, onclick: () => {
          const n = Math.min(Math.max(parseInt(qty.value) || 1, 1), p.stock);
          const inCart = (O.cart.get().find(x => x.id === p.id) || { qty: 0 }).qty;
          if (inCart + n > p.stock) return O.toast('Only ' + p.stock + ' ' + p.unit + ' available', true);
          O.cart.add(p.id, n); O.toast(p.name + ' added to cart'); } }, 'Add to cart'))));
  };
  const render = () => {
    const t = q.value.trim().toLowerCase(), list = all.filter(p => !t || (p.name + p.description + p.category).toLowerCase().includes(t));
    count.textContent = list.length + ' product' + (list.length === 1 ? '' : 's');
    grid.replaceChildren(...(list.length ? list.map(card) : [h('p', { class: 'note' }, 'No products match.')])); O.reveal(grid);
  };
  try { all = await api('/products'); render(); q.addEventListener('input', render); }
  catch { grid.replaceChildren(h('p', { class: 'note err' }, 'The shop needs the Orgiin server running. Please try again shortly.')); }
})();
