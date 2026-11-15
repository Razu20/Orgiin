const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dbmod = require('./db');
const db = dbmod.db;

const PORT = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const secretFile = path.join(dataDir, 'jwt.secret');
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  SECRET = fs.readFileSync(secretFile, 'utf8');
}
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], frameSrc: ['https://www.google.com'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'", 'mailto:'] } },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// CSRF defence: cookies are SameSite=Lax and every state-changing API call must carry a custom header
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'orgiin')
    return res.status(403).json({ error: 'Forbidden' });
  next();
});

// ---------- helpers ----------
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120;
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); } };
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role });

function issue(res, user) {
  const t = jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' });
  res.cookie('orgiin_token', t, { httpOnly: true, sameSite: 'lax', secure: res.req.secure, maxAge: 7 * 864e5 });
}
function load(req, _res, next) {
  const t = req.cookies.orgiin_token;
  if (t) { try { const { id } = jwt.verify(t, SECRET); const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id); if (u) req.user = u; } catch {} }
  next();
}
const needUser = (req, res, next) => req.user ? next() : bad(res, 'Please log in', 401);
const needAdmin = (req, res, next) => !req.user ? bad(res, 'Please log in', 401) : req.user.role !== 'admin' ? bad(res, 'Admins only', 403) : next();
app.use(load);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts, try again later' } });
const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many submissions, try again later' } });

// ---------- auth ----------
app.post('/api/auth/register', authLimiter, wrap((req, res) => {
  const name = str(req.body.name, 80), email = str(req.body.email, 120).toLowerCase(), phone = str(req.body.phone, 20), pw = typeof req.body.password === 'string' ? req.body.password : '';
  if (!name || !emailOk(email)) return bad(res, 'Valid name and email required');
  if (pw.length < 8 || pw.length > 72) return bad(res, 'Password must be 8–72 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return bad(res, 'Email already registered', 409);
  const id = db.prepare("INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)").run(name, email, phone, bcrypt.hashSync(pw, 10)).lastInsertRowid;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id); issue(res, u); res.json({ user: publicUser(u) });
}));
app.post('/api/auth/login', authLimiter, wrap((req, res) => {
  const email = str(req.body.email, 120).toLowerCase(), pw = typeof req.body.password === 'string' ? req.body.password : '';
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !u.active || !bcrypt.compareSync(pw, u.password_hash)) return bad(res, 'Wrong email or password', 401);
  issue(res, u); res.json({ user: publicUser(u) });
}));
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('orgiin_token'); res.json({ ok: true }); });
app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

// ---------- public content ----------
app.get('/api/products', wrap((_req, res) => res.json(db.prepare('SELECT id,name,description,category,price,unit,stock,image,color FROM products WHERE active=1 ORDER BY id').all())));
app.get('/api/team', wrap((_req, res) => res.json(db.prepare('SELECT id,name,role,bio,photo,kind FROM team ORDER BY sort,id').all())));
app.get('/api/jobs', wrap((_req, res) => res.json(db.prepare('SELECT id,title,description,location FROM jobs WHERE active=1 ORDER BY id').all())));
app.post('/api/contact', formLimiter, wrap((req, res) => {
  const b = req.body, name = str(b.name, 80), email = str(b.email, 120), body = str(b.details, 3000);
  if (!name || !emailOk(email) || !body) return bad(res, 'Name, valid email and message are required');
  db.prepare('INSERT INTO messages(name,phone,email,topic,body) VALUES(?,?,?,?,?)').run(name, str(b.phone, 20), email, str(b.topic, 60), body);
  res.json({ ok: true });
}));
app.post('/api/apply', formLimiter, wrap((req, res) => {
  const b = req.body, name = str(b.name, 80), email = str(b.email, 120), role = str(b.role, 80), body = str(b.details, 3000);
  if (!name || !emailOk(email) || !role || !body) return bad(res, 'All fields are required');
  db.prepare('INSERT INTO applications(name,phone,email,role,body) VALUES(?,?,?,?,?)').run(name, str(b.phone, 20), email, role, body);
  res.json({ ok: true });
}));

// ---------- user: account & orders ----------
app.put('/api/account', needUser, wrap((req, res) => {
  const name = str(req.body.name, 80) || req.user.name, phone = str(req.body.phone, 20);
  let hash = req.user.password_hash;
  if (req.body.newPassword) {
    if (!bcrypt.compareSync(String(req.body.currentPassword || ''), hash)) return bad(res, 'Current password is wrong', 403);
    const np = String(req.body.newPassword); if (np.length < 8 || np.length > 72) return bad(res, 'Password must be 8–72 characters');
    hash = bcrypt.hashSync(np, 10);
  }
  db.prepare('UPDATE users SET name=?,phone=?,password_hash=? WHERE id=?').run(name, phone, hash, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
}));

const orderWithItems = o => o && { ...o, items: db.prepare('SELECT product_id,name,price,qty FROM order_items WHERE order_id=?').all(o.id) };
const placeOrder = db.transaction((user, b, items) => {
  let total = 0; const lines = [];
  for (const it of items) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(it.id);
    const qty = Number.isInteger(it.qty) ? it.qty : NaN;
    if (!p || !(qty >= 1 && qty <= 1000)) throw new Error('Invalid item in cart');
    if (p.stock < qty) throw new Error(`Only ${p.stock} ${p.unit} of ${p.name} left`);
    db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty, p.id);
    total += p.price * qty; lines.push([p, qty]);
  }
  const oid = db.prepare('INSERT INTO orders(user_id,name,phone,address,notes,total) VALUES(?,?,?,?,?,?)').run(user.id, b.name, b.phone, b.address, b.notes, total).lastInsertRowid;
  const ins = db.prepare('INSERT INTO order_items(order_id,product_id,name,price,qty) VALUES(?,?,?,?,?)');
  lines.forEach(([p, q]) => ins.run(oid, p.id, p.name, p.price, q));
  return oid;
});
app.post('/api/orders', needUser, wrap((req, res) => {
  const b = { name: str(req.body.name, 80), phone: str(req.body.phone, 20), address: str(req.body.address, 300), notes: str(req.body.notes, 1000) };
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50).map(i => ({ id: Number(i.id), qty: Number(i.qty) })) : [];
  if (!b.name || !b.phone || !b.address) return bad(res, 'Name, phone and delivery address are required');
  if (!items.length) return bad(res, 'Your cart is empty');
  try { const id = placeOrder(req.user, b, items); res.json({ order: orderWithItems(db.prepare('SELECT * FROM orders WHERE id=?').get(id)) }); }
  catch (e) { bad(res, e.message, 409); }
}));
app.get('/api/orders/mine', needUser, wrap((req, res) =>
  res.json(db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id).map(orderWithItems))));
const restock = db.transaction(id => {
  db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(id).forEach(i => i.product_id && db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.qty, i.product_id));
  db.prepare("UPDATE orders SET status='cancelled' WHERE id=?").run(id);
});
app.post('/api/orders/:id/cancel', needUser, wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!o) return bad(res, 'Not found', 404);
  if (o.status !== 'pending') return bad(res, 'Only pending orders can be cancelled', 409);
  restock(o.id); res.json({ ok: true });
}));

// ---------- admin ----------
const admin = express.Router(); admin.use(needAdmin); app.use('/api/admin', admin);

admin.get('/stats', wrap((_req, res) => {
  const one = (q, ...a) => db.prepare(q).get(...a);
  res.json({
    revenue: one("SELECT COALESCE(SUM(total),0) v FROM orders WHERE status!='cancelled'").v,
    orders: one('SELECT COUNT(*) v FROM orders').v, pending: one("SELECT COUNT(*) v FROM orders WHERE status='pending'").v,
    users: one("SELECT COUNT(*) v FROM users WHERE role='user'").v, products: one('SELECT COUNT(*) v FROM products WHERE active=1').v,
    lowStock: db.prepare('SELECT id,name,stock,unit FROM products WHERE active=1 AND stock<=10 ORDER BY stock').all(),
    newMessages: one("SELECT COUNT(*) v FROM messages WHERE status='new'").v, newApplications: one("SELECT COUNT(*) v FROM applications WHERE status='new'").v,
    byStatus: db.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all(),
    recent: db.prepare('SELECT id,name,total,status,created_at FROM orders ORDER BY id DESC LIMIT 6').all()
  });
}));

// products
const prodFields = b => ({ name: str(b.name, 100), description: str(b.description, 1000), category: str(b.category, 50) || 'Dye powder', price: Number(b.price), unit: str(b.unit, 10) || 'kg', stock: Number(b.stock), image: str(b.image, 200), color: /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#b5452f', active: b.active === false || b.active === 0 ? 0 : 1 });
const prodValid = p => p.name && Number.isFinite(p.price) && p.price >= 0 && Number.isInteger(p.stock) && p.stock >= 0 && (!p.image || /^(images|uploads)\/[\w.\- ]+$/.test(p.image));
admin.get('/products', wrap((_req, res) => res.json(db.prepare('SELECT * FROM products ORDER BY id DESC').all())));
admin.post('/products', wrap((req, res) => {
  const p = prodFields(req.body); if (!prodValid(p)) return bad(res, 'Check name, price, stock and image path');
  const id = db.prepare('INSERT INTO products(name,description,category,price,unit,stock,image,color,active) VALUES(@name,@description,@category,@price,@unit,@stock,@image,@color,@active)').run(p).lastInsertRowid;
  res.json(db.prepare('SELECT * FROM products WHERE id=?').get(id));
}));
admin.put('/products/:id', wrap((req, res) => {
  const p = prodFields(req.body); if (!prodValid(p)) return bad(res, 'Check name, price, stock and image path');
  const r = db.prepare('UPDATE products SET name=@name,description=@description,category=@category,price=@price,unit=@unit,stock=@stock,image=@image,color=@color,active=@active WHERE id=@id').run({ ...p, id: req.params.id });
  r.changes ? res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id)) : bad(res, 'Not found', 404);
}));
admin.delete('/products/:id', wrap((req, res) => { db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id); res.json({ ok: true }); })); // soft delete keeps order history intact

const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (_r, f, cb) => cb(null, crypto.randomBytes(8).toString('hex') + ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[f.mimetype]) }),
  limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_r, f, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype)) });
admin.post('/upload', upload.single('image'), (req, res) => req.file ? res.json({ path: 'uploads/' + req.file.filename }) : bad(res, 'Upload a JPG, PNG or WebP under 2 MB'));

// orders
const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
admin.get('/orders', wrap((req, res) => {
  const s = str(req.query.status, 20);
  const rows = s ? db.prepare('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id WHERE status=? ORDER BY o.id DESC').all(s) : db.prepare('SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC').all();
  res.json(rows.map(orderWithItems));
}));
admin.put('/orders/:id/status', wrap((req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id); const s = req.body.status;
  if (!o) return bad(res, 'Not found', 404); if (!STATUSES.includes(s)) return bad(res, 'Invalid status');
  if (o.status === 'cancelled') return bad(res, 'Cancelled orders cannot be changed', 409);
  if (s === 'cancelled') restock(o.id); else db.prepare('UPDATE orders SET status=? WHERE id=?').run(s, o.id);
  res.json({ ok: true });
}));

// users
admin.get('/users', wrap((_req, res) => res.json(db.prepare('SELECT u.id,u.name,u.email,u.phone,u.role,u.active,u.created_at,(SELECT COUNT(*) FROM orders WHERE user_id=u.id) orders FROM users u ORDER BY u.id').all())));
admin.put('/users/:id', wrap((req, res) => {
  const id = Number(req.params.id); if (id === req.user.id) return bad(res, 'You cannot change your own role or status', 409);
  const role = req.body.role === 'admin' ? 'admin' : 'user', active = req.body.active === false ? 0 : 1;
  db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(role, active, id); res.json({ ok: true });
}));

// messages & applications
for (const [path_, table] of [['messages', 'messages'], ['applications', 'applications']]) {
  admin.get('/' + path_, wrap((_req, res) => res.json(db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all())));
  admin.put(`/${path_}/:id`, wrap((req, res) => { db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(['new', 'read', 'replied'].includes(req.body.status) ? req.body.status : 'read', req.params.id); res.json({ ok: true }); }));
  admin.delete(`/${path_}/:id`, wrap((req, res) => { db.prepare(`DELETE FROM ${table} WHERE id=?`).run(req.params.id); res.json({ ok: true }); }));
}

// team
const teamFields = b => ({ name: str(b.name, 80), role: str(b.role, 80), bio: str(b.bio, 300), photo: str(b.photo, 200), kind: b.kind === 'leader' ? 'leader' : 'member', sort: Number.isInteger(Number(b.sort)) ? Number(b.sort) : 0 });
const teamValid = t => t.name && t.role && (!t.photo || /^(images|uploads)\/[\w.\- ]+$/.test(t.photo));
admin.get('/team', wrap((_req, res) => res.json(db.prepare('SELECT * FROM team ORDER BY sort,id').all())));
admin.post('/team', wrap((req, res) => { const t = teamFields(req.body); if (!teamValid(t)) return bad(res, 'Name and role required'); db.prepare('INSERT INTO team(name,role,bio,photo,kind,sort) VALUES(@name,@role,@bio,@photo,@kind,@sort)').run(t); res.json({ ok: true }); }));
admin.put('/team/:id', wrap((req, res) => { const t = teamFields(req.body); if (!teamValid(t)) return bad(res, 'Name and role required'); db.prepare('UPDATE team SET name=@name,role=@role,bio=@bio,photo=@photo,kind=@kind,sort=@sort WHERE id=@id').run({ ...t, id: req.params.id }); res.json({ ok: true }); }));
admin.delete('/team/:id', wrap((req, res) => { db.prepare('DELETE FROM team WHERE id=?').run(req.params.id); res.json({ ok: true }); }));

// jobs
const jobFields = b => ({ title: str(b.title, 80), description: str(b.description, 300), location: str(b.location, 60) || 'Khulna', active: b.active === false ? 0 : 1 });
admin.get('/jobs', wrap((_req, res) => res.json(db.prepare('SELECT * FROM jobs ORDER BY id DESC').all())));
admin.post('/jobs', wrap((req, res) => { const j = jobFields(req.body); if (!j.title) return bad(res, 'Title required'); db.prepare('INSERT INTO jobs(title,description,location,active) VALUES(@title,@description,@location,@active)').run(j); res.json({ ok: true }); }));
admin.put('/jobs/:id', wrap((req, res) => { const j = jobFields(req.body); if (!j.title) return bad(res, 'Title required'); db.prepare('UPDATE jobs SET title=@title,description=@description,location=@location,active=@active WHERE id=@id').run({ ...j, id: req.params.id }); res.json({ ok: true }); }));
admin.delete('/jobs/:id', wrap((req, res) => { db.prepare('DELETE FROM jobs WHERE id=?').run(req.params.id); res.json({ ok: true }); }));

app.use('/api', (_req, res) => bad(res, 'Not found', 404));
// admin page is only served to admins
app.get('/admin.html', (req, res) => (req.user && req.user.role === 'admin') ? res.sendFile(path.join(__dirname, 'private', 'admin.html')) : res.redirect('/login.html?next=admin'));
app.use('/uploads', express.static(uploadDir, { maxAge: '7d', setHeaders: r => r.setHeader('X-Content-Type-Options', 'nosniff') }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((err, _req, res, _next) => { console.error(err.message); res.status(err.status || 500).json({ error: 'Request failed' }); });

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Orgiin running on http://localhost:${PORT}`);
    if (dbmod.seededAdmin) console.log(`\nFirst run — admin account created:\n  email:    ${dbmod.seededAdmin.email}\n  password: ${dbmod.seededAdmin.password || '(from ADMIN_PASSWORD)'}\nLog in at /login.html and change it under Account.\n`);
  });
}
module.exports = app;
