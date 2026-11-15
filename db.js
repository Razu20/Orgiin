const { DatabaseSync } = require('node:sqlite'); // built into Node 22.13+ — no native build step
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'orgiin.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.transaction = fn => (...a) => {            // minimal better-sqlite3-style transaction helper
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(...a); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN('user','admin')),
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT 'Dye powder',
  price REAL NOT NULL CHECK(price>=0), unit TEXT DEFAULT 'kg', stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0),
  image TEXT DEFAULT '', color TEXT DEFAULT '#b5452f', active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, phone TEXT NOT NULL,
  address TEXT NOT NULL, notes TEXT DEFAULT '', total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','processing','shipped','delivered','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER, name TEXT NOT NULL, price REAL NOT NULL, qty INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT NOT NULL, topic TEXT DEFAULT '',
  body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS applications(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT NOT NULL, role TEXT NOT NULL,
  body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS team(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, bio TEXT DEFAULT '', photo TEXT DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'member' CHECK(kind IN('leader','member')), sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS jobs(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', location TEXT DEFAULT 'Khulna',
  active INTEGER NOT NULL DEFAULT 1);
`);

// ---- seed (only on a fresh database) ----
const count = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
let generatedAdminPassword = null;

if (count('users') === 0) {
  const email = (process.env.ADMIN_EMAIL || 'admin@orgiin.local').toLowerCase();
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) { pw = crypto.randomBytes(9).toString('base64url'); generatedAdminPassword = pw; }
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')")
    .run('Razu Sarder', email, bcrypt.hashSync(pw, 10));
  module.exports.seededAdmin = { email, password: generatedAdminPassword };
}
if (count('team') === 0) {
  const t = db.prepare('INSERT INTO team(name,role,bio,photo,kind,sort) VALUES(?,?,?,?,?,?)');
  [['Razu Sarder','Chief Executive Officer','Leads Orgiin’s vision, strategy and technology.','images/razu.jpg','leader',1],
   ['Moonjila','Marketing Manager','Builds the Orgiin brand and brings natural dyes to new customers.','','leader',2],
   ['Nourin Haque','Founding Team','Part of the team that started Orgiin.','images/nourin.jpg','member',3],
   ['Tahrim Sadman','Textile Expert','Guides fabric preparation and dye fastness.','images/tahrim.jpg','member',4],
   ['Talha Arif','Chemical & Colour Expert','Develops and tests our natural colour recipes.','images/talha.jpg','member',5],
   ['Sajia Khatun','Pharmaceutical Specialist','Ensures our plant extracts are safe and consistent.','','member',6]
  ].forEach(r => t.run(...r));
}
if (count('products') === 0) {
  // SAMPLE catalogue — edit prices/stock in the admin panel.
  const p = db.prepare('INSERT INTO products(name,description,price,unit,stock,color) VALUES(?,?,?,?,?,?)');
  [['Madder Red Dye Powder','Warm red from madder root. Good on cotton and silk.',900,'kg',50,'#b5452f'],
   ['Turmeric Yellow Dye Powder','Bright golden yellow from turmeric root.',700,'kg',60,'#e0a526'],
   ['Indigo Blue Dye Powder','Deep blue from indigo leaf.',1200,'kg',40,'#2b3a63'],
   ['Catechu Brown Dye Powder','Earthy browns from catechu bark.',800,'kg',45,'#8a5a3c'],
   ['Leaf Green Dye Powder','Soft greens from neem and other leaves.',850,'kg',35,'#4f7a52'],
   ['Rose Petal Pink Dye Powder','Gentle pinks from flower petals.',1000,'kg',30,'#d98fa0']
  ].forEach(r => p.run(...r));
}
if (count('jobs') === 0) {
  const j = db.prepare('INSERT INTO jobs(title,description,location) VALUES(?,?,?)');
  [['Researcher','Natural dye research','Khulna'],['Marketing Associate','Brand & outreach','Khulna / Remote'],['Textile Technician','Dyeing & fabric trials','Khulna']].forEach(r => j.run(...r));
}
module.exports.db = db;
