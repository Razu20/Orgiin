(async () => {
  const { h, api, money, date } = O; await O.ready;
  if (!O.user || O.user.role !== 'admin') return location.href = 'login.html?next=admin';
  const view = document.getElementById('view'), title = document.getElementById('title'), tools = document.getElementById('tools'), tabsEl = document.getElementById('tabs');
  document.getElementById('logout').onclick = async () => { await api('/auth/logout', 'POST'); location.href = 'index.html'; };
  document.getElementById('sb').onclick = () => document.body.classList.toggle('sbopen');
  const fail = e => O.toast(e.message, true);
  const badge = s => h('span', { class: 'badge s-' + s }, s);

  /* generic table */
  const table = (cols, rows, empty = 'Nothing here yet.') => rows.length
    ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c.t)))), h('tbody', {}, rows.map(r => h('tr', {}, cols.map(c => h('td', { 'data-l': c.t }, c.f(r))))))))
    : h('p', { class: 'note' }, empty);
  const btn = (label, fn, cls = '') => h('button', { class: 'sbtn ' + cls, onclick: fn }, label);

  /* generic modal form: fields [{k,l,type,opts}] */
  function modal(heading, fields, vals, save) {
    const inputs = {};
    const row = f => {
      const v = vals[f.k] ?? (f.def ?? '');
      let el;
      if (f.type === 'textarea') el = h('textarea', { rows: 3 }, v);
      else if (f.type === 'select') el = h('select', {}, f.opts.map(o => h('option', { value: o, selected: String(o) === String(v) }, o)));
      else if (f.type === 'check') el = h('input', { type: 'checkbox', checked: v === '' ? true : !!Number(v) });
      else if (f.type === 'image') {
        const t = h('input', { type: 'text', value: v, placeholder: 'images/… or uploads/…' }); inputs[f.k] = t;
        const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', onchange: async () => {
          const fd = new FormData(); fd.append('image', file.files[0]);
          const r = await fetch('/api/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'orgiin' } }); const j = await r.json();
          r.ok ? (t.value = j.path) : fail(new Error(j.error)); } });
        return h('label', {}, f.l, t, file);
      } else el = h('input', { type: f.type || 'text', value: v, step: f.type === 'number' ? 'any' : null });
      inputs[f.k] = el; return h('label', { class: f.type === 'check' ? 'chk' : '' }, f.l, el);
    };
    const dlg = h('div', { class: 'overlay', onclick: e => e.target === dlg && dlg.remove() }, h('form', { class: 'dlg', onsubmit: async e => {
      e.preventDefault(); const o = {};
      for (const f of fields) { const el = inputs[f.k]; o[f.k] = f.type === 'check' ? el.checked : f.type === 'number' ? Number(el.value) : el.value; }
      try { await save(o); dlg.remove(); } catch (err) { fail(err); } } },
      h('h3', {}, heading), fields.map(row), h('div', { class: 'acts' }, h('button', { type: 'button', class: 'sbtn', onclick: () => dlg.remove() }, 'Cancel'), h('button', { class: 'sbtn pri' }, 'Save'))));
    document.body.append(dlg);
  }
  const confirmDel = (msg, fn) => confirm(msg) && fn().catch(fail);

  /* ---------- sections ---------- */
  const S = {};
  S.dashboard = { label: '📊 Dashboard', async render() {
    const s = await api('/admin/stats');
    const stat = (n, l, c) => h('div', { class: 'stat' }, h('b', { style: c ? { color: c } : {} }, n), h('span', {}, l));
    view.replaceChildren(h('div', { class: 'stats-g' }, stat(money(s.revenue), 'Revenue (excl. cancelled)'), stat(s.orders, 'Total orders'), stat(s.pending, 'Pending orders', s.pending ? 'var(--madder)' : ''), stat(s.users, 'Customers'), stat(s.products, 'Active products'), stat(s.newMessages + s.newApplications, 'Unread messages / applications')),
      h('div', { class: 'two-c' },
        h('section', { class: 'panel' }, h('h3', {}, 'Recent orders'), table([{ t: '#', f: r => r.id }, { t: 'Customer', f: r => r.name }, { t: 'Total', f: r => money(r.total) }, { t: 'Status', f: r => badge(r.status) }], s.recent)),
        h('section', { class: 'panel' }, h('h3', {}, 'Low stock (≤ 10)'), table([{ t: 'Product', f: r => r.name }, { t: 'Left', f: r => r.stock + ' ' + r.unit }], s.lowStock, 'All products well stocked.'),
          h('h3', { style: { marginTop: '22px' } }, 'Orders by status'), h('div', {}, s.byStatus.map(b => h('span', { style: { marginRight: '10px' } }, badge(b.status), ' ' + b.n))))));
  } };

  S.orders = { label: '🧾 Orders', async render() {
    const filter = h('select', { onchange: () => this.render() }, ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => h('option', { selected: s === (this.f || 'all') }, s)));
    filter.onchange = () => { this.f = filter.value; this.render(); };
    tools.replaceChildren(filter);
    const rows = await api('/admin/orders' + (this.f && this.f !== 'all' ? '?status=' + this.f : ''));
    view.replaceChildren(table([{ t: '#', f: r => r.id }, { t: 'Date', f: r => date(r.created_at) }, { t: 'Customer', f: r => h('div', {}, h('b', {}, r.name), h('br'), h('small', {}, r.phone + ' · ' + r.email)) },
      { t: 'Items', f: r => h('ul', { class: 'mini' }, r.items.map(i => h('li', {}, i.qty + '× ' + i.name))) },
      { t: 'Delivery', f: r => h('small', {}, r.address + (r.notes ? ' — Note: ' + r.notes : '')) }, { t: 'Total', f: r => money(r.total) },
      { t: 'Status', f: r => r.status === 'cancelled' ? badge('cancelled') : h('select', { onchange: e => api('/admin/orders/' + r.id + '/status', 'PUT', { status: e.target.value }).then(() => { O.toast('Order #' + r.id + ' → ' + e.target.value); this.render(); }).catch(fail) },
        ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => h('option', { selected: s === r.status }, s))) }], rows, 'No orders.'));
  } };

  const prodFields = [{ k: 'name', l: 'Name' }, { k: 'description', l: 'Description', type: 'textarea' }, { k: 'category', l: 'Category', def: 'Dye powder' }, { k: 'price', l: 'Price (৳)', type: 'number' }, { k: 'unit', l: 'Unit', def: 'kg' }, { k: 'stock', l: 'Stock', type: 'number', def: 0 }, { k: 'color', l: 'Swatch colour', type: 'color', def: '#b5452f' }, { k: 'image', l: 'Image (optional)', type: 'image' }, { k: 'active', l: 'Visible in shop', type: 'check' }];
  S.products = { label: '🎨 Products', async render() {
    tools.replaceChildren(btn('+ Add product', () => modal('New product', prodFields, {}, async v => { await api('/admin/products', 'POST', v); this.render(); }), 'pri'));
    const rows = await api('/admin/products');
    view.replaceChildren(table([{ t: '', f: r => h('i', { class: 'sw', style: { background: r.color } }) }, { t: 'Name', f: r => h('b', {}, r.name) }, { t: 'Price', f: r => money(r.price) + ' / ' + r.unit }, { t: 'Stock', f: r => h('span', { class: r.stock <= 10 ? 'low' : '' }, r.stock) }, { t: 'Shop', f: r => r.active ? 'Visible' : 'Hidden' },
      { t: '', f: r => h('div', { class: 'acts' }, btn('Edit', () => modal('Edit product', prodFields, r, async v => { await api('/admin/products/' + r.id, 'PUT', v); this.render(); })), r.active && btn('Hide', () => confirmDel('Hide ' + r.name + ' from the shop? Order history is kept.', async () => { await api('/admin/products/' + r.id, 'DELETE'); this.render(); }), 'dng')) }], rows));
  } };

  S.users = { label: '👥 Users', async render() {
    const rows = await api('/admin/users');
    const upd = (r, p) => api('/admin/users/' + r.id, 'PUT', { role: r.role, active: !!r.active, ...p }).then(() => this.render()).catch(fail);
    view.replaceChildren(table([{ t: 'Name', f: r => h('b', {}, r.name) }, { t: 'Email', f: r => r.email }, { t: 'Phone', f: r => r.phone }, { t: 'Orders', f: r => r.orders }, { t: 'Joined', f: r => date(r.created_at) }, { t: 'Role', f: r => h('span', { class: 'badge ' + (r.role === 'admin' ? 's-shipped' : '') }, r.role) }, { t: 'Status', f: r => r.active ? 'Active' : h('span', { class: 'low' }, 'Disabled') },
      { t: '', f: r => r.id === O.user.id ? h('small', {}, 'you') : h('div', { class: 'acts' }, btn(r.role === 'admin' ? 'Make user' : 'Make admin', () => confirm('Change role for ' + r.name + '?') && upd(r, { role: r.role === 'admin' ? 'user' : 'admin' })), btn(r.active ? 'Disable' : 'Enable', () => upd(r, { active: !r.active }), r.active ? 'dng' : '')) }], rows));
  } };

  const inbox = (key, label, cols) => ({ label, async render() {
    const rows = await api('/admin/' + key);
    view.replaceChildren(table([...cols, { t: 'Status', f: r => badge(r.status) }, { t: '', f: r => h('div', { class: 'acts' },
      r.status !== 'read' && btn('Mark read', () => api('/admin/' + key + '/' + r.id, 'PUT', { status: 'read' }).then(() => this.render()).catch(fail)),
      btn('Replied', () => api('/admin/' + key + '/' + r.id, 'PUT', { status: 'replied' }).then(() => this.render()).catch(fail)),
      h('a', { class: 'sbtn', href: 'mailto:' + r.email }, 'Email'),
      btn('Delete', () => confirmDel('Delete this entry?', async () => { await api('/admin/' + key + '/' + r.id, 'DELETE'); this.render(); }), 'dng')) }], rows, 'Inbox is empty.'));
  } });
  const body = r => h('div', { class: 'msgbody' }, r.body);
  S.messages = inbox('messages', '✉️ Messages', [{ t: 'Date', f: r => date(r.created_at) }, { t: 'From', f: r => h('div', {}, h('b', {}, r.name), h('br'), h('small', {}, r.email + (r.phone ? ' · ' + r.phone : ''))) }, { t: 'Topic', f: r => r.topic }, { t: 'Message', f: body }]);
  S.applications = inbox('applications', '💼 Applications', [{ t: 'Date', f: r => date(r.created_at) }, { t: 'Applicant', f: r => h('div', {}, h('b', {}, r.name), h('br'), h('small', {}, r.email + (r.phone ? ' · ' + r.phone : ''))) }, { t: 'Role', f: r => r.role }, { t: 'Details', f: body }]);

  const teamFields = [{ k: 'name', l: 'Name' }, { k: 'role', l: 'Role / title' }, { k: 'bio', l: 'Short bio', type: 'textarea' }, { k: 'kind', l: 'Section', type: 'select', opts: ['leader', 'member'] }, { k: 'sort', l: 'Order (1 = first)', type: 'number', def: 10 }, { k: 'photo', l: 'Photo (optional)', type: 'image' }];
  S.team = { label: '🌿 Team', async render() {
    tools.replaceChildren(btn('+ Add member', () => modal('New team member', teamFields, {}, async v => { await api('/admin/team', 'POST', v); this.render(); }), 'pri'));
    const rows = await api('/admin/team');
    view.replaceChildren(h('p', { class: 'note' }, '“leader” members appear in the highlighted top row of the public Team section.'), table([{ t: '#', f: r => r.sort }, { t: 'Name', f: r => h('b', {}, r.name) }, { t: 'Role', f: r => r.role }, { t: 'Section', f: r => r.kind }, { t: '', f: r => h('div', { class: 'acts' }, btn('Edit', () => modal('Edit member', teamFields, r, async v => { await api('/admin/team/' + r.id, 'PUT', v); this.render(); })), btn('Delete', () => confirmDel('Remove ' + r.name + '?', async () => { await api('/admin/team/' + r.id, 'DELETE'); this.render(); }), 'dng')) }], rows));
  } };

  const jobFields = [{ k: 'title', l: 'Job title' }, { k: 'description', l: 'Description', type: 'textarea' }, { k: 'location', l: 'Location', def: 'Khulna' }, { k: 'active', l: 'Open for applications', type: 'check' }];
  S.jobs = { label: '📌 Job openings', async render() {
    tools.replaceChildren(btn('+ Add job', () => modal('New job', jobFields, {}, async v => { await api('/admin/jobs', 'POST', v); this.render(); }), 'pri'));
    const rows = await api('/admin/jobs');
    view.replaceChildren(table([{ t: 'Title', f: r => h('b', {}, r.title) }, { t: 'Location', f: r => r.location }, { t: 'Status', f: r => r.active ? 'Open' : 'Closed' }, { t: '', f: r => h('div', { class: 'acts' }, btn('Edit', () => modal('Edit job', jobFields, r, async v => { await api('/admin/jobs/' + r.id, 'PUT', v); this.render(); })), btn('Delete', () => confirmDel('Delete this job?', async () => { await api('/admin/jobs/' + r.id, 'DELETE'); this.render(); }), 'dng')) }], rows));
  } };

  /* ---------- router ---------- */
  const go = async k => {
    if (!S[k]) k = 'dashboard'; location.hash = k; document.body.classList.remove('sbopen');
    tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    title.textContent = S[k].label.replace(/^\S+\s/, ''); tools.replaceChildren(); view.replaceChildren(h('p', { class: 'note' }, 'Loading…'));
    try { await S[k].render(); } catch (e) { view.replaceChildren(h('p', { class: 'note err' }, e.message)); }
  };
  tabsEl.replaceChildren(...Object.entries(S).map(([k, s]) => h('button', { 'data-k': k, onclick: () => go(k) }, s.label)));
  go(location.hash.slice(1) || 'dashboard');
})();
