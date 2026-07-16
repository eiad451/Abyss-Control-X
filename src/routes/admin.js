const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, username, role, is_active, subscription_ends, created_at, last_login FROM users').all();
  res.json(users);
});

router.post('/users', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبان' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: 'المستخدم موجود مسبقاً' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role || 'user');
  res.json({ id: result.lastInsertRowid, message: 'تم إنشاء المستخدم' });
});

router.put('/users/:id', (req, res) => {
  const { is_active, role, subscription_ends } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  db.prepare(`
    UPDATE users SET is_active = COALESCE(?, is_active), role = COALESCE(?, role),
    subscription_ends = COALESCE(?, subscription_ends) WHERE id = ?
  `).run(is_active !== undefined ? (is_active ? 1 : 0) : null, role || null, subscription_ends || null, req.params.id);

  res.json({ message: 'تم تحديث المستخدم' });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'لا يمكن حذف نفسك' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف المستخدم' });
});

router.post('/broadcast', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });

  const users = db.prepare('SELECT id, username FROM users WHERE is_active = 1').all();
  db.prepare('INSERT INTO publish_logs (action, status, details, user_id) VALUES (?, ?, ?, ?)').run('broadcast', 'success', `إرسال إشعار جماعي لـ ${users.length} مستخدم: ${message.slice(0, 50)}...`, req.user.id);

  res.json({ sent: users.length, message: `تم إرسال الإشعار لـ ${users.length} مستخدم` });
});

router.post('/backup', (req, res) => {
  const backupDir = path.join(__dirname, '../../backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename = `backup-${Date.now()}.sqlite`;
  const dest = path.join(backupDir, filename);
  const source = path.resolve(__dirname, '../../data/database.sqlite');

  try {
    fs.copyFileSync(source, dest);
    const stats = fs.statSync(dest);
    db.prepare('INSERT INTO backups (filename, size) VALUES (?, ?)').run(filename, stats.size);
    res.json({ filename, size: stats.size, message: '✓ تم إنشاء النسخة الاحتياطية' });
  } catch (err) {
    res.status(500).json({ error: `فشل النسخ الاحتياطي: ${err.message}` });
  }
});

router.get('/backups', (req, res) => {
  const backups = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();
  res.json(backups);
});

router.post('/settings', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'المفتاح مطلوب' });
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ message: 'تم حفظ الإعداد' });
});

router.get('/logs', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as c FROM publish_logs').get().c;
  const logs = db.prepare(`
    SELECT pl.*, c.username as channel_username, a.name as account_name, u.username as user_username
    FROM publish_logs pl
    LEFT JOIN channels c ON pl.channel_id = c.id
    LEFT JOIN accounts a ON pl.account_id = a.id
    LEFT JOIN users u ON pl.user_id = u.id
    ORDER BY pl.created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  res.json({ logs, total, page, pages: Math.ceil(total / limit) });
});

router.post('/system/restart', (req, res) => {
  const scheduler = require('../services/scheduler');
  scheduler.stopAll();
  scheduler.start();
  db.prepare('INSERT INTO publish_logs (action, status, details, user_id) VALUES (?, ?, ?, ?)').run('system', 'success', 'تم إعادة تشغيل النظام', req.user.id);
  res.json({ message: '✓ تم إعادة تشغيل النظام' });
});

router.post('/system/stop', (req, res) => {
  const scheduler = require('../services/scheduler');
  scheduler.stopAll();
  db.prepare('UPDATE accounts SET status = ? WHERE status = ?').run('disconnected', 'connected');
  db.prepare('INSERT INTO publish_logs (action, status, details, user_id) VALUES (?, ?, ?, ?)').run('system', 'info', 'تم إيقاف النظام', req.user.id);
  res.json({ message: 'تم إيقاف النظام' });
});

module.exports = router;
