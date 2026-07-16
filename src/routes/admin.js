const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { query, queryOne, execute } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/users', async (req, res) => {
  try {
    const rows = await query('SELECT id, username, role, is_active, subscription_ends, created_at, last_login FROM users');
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'الاسم وكلمة المرور مطلوبان' });
    const existing = await queryOne('SELECT id FROM users WHERE username = $1', [username]);
    if (existing) return res.status(400).json({ error: 'المستخدم موجود مسبقاً' });
    const hash = bcrypt.hashSync(password, 10);
    await execute('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, hash, role || 'user']);
    res.json({ message: 'تم إنشاء المستخدم' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const { is_active, role, subscription_ends } = req.body;
    await execute('UPDATE users SET is_active = COALESCE($1, is_active), role = COALESCE($2, role), subscription_ends = COALESCE($3, subscription_ends) WHERE id = $4', [is_active !== undefined ? (is_active ? 1 : 0) : null, role || null, subscription_ends || null, req.params.id]);
    res.json({ message: 'تم تحديث المستخدم' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'لا يمكن حذف نفسك' });
    await execute('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم حذف المستخدم' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'الرسالة مطلوبة' });
    const rows = await query('SELECT id, username FROM users WHERE is_active = 1');
    await execute('INSERT INTO publish_logs (action, status, details, user_id) VALUES ($1, $2, $3, $4)', ['broadcast', 'success', `إرسال إشعار جماعي لـ ${rows.rows.length} مستخدم: ${message.slice(0, 50)}...`, req.user.id]);
    res.json({ sent: rows.rows.length, message: `تم إرسال الإشعار لـ ${rows.rows.length} مستخدم` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/backup', async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const filename = `backup-${Date.now()}.sqlite`;
    const dest = path.join(backupDir, filename);
    const source = path.resolve(__dirname, '../../data/database.sqlite');
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, dest);
      const stats = fs.statSync(dest);
      await execute('INSERT INTO backups (filename, size) VALUES ($1, $2)', [filename, stats.size]);
      res.json({ filename, size: stats.size, message: '✓ تم إنشاء النسخة الاحتياطية' });
    } else res.json({ message: 'قاعدة البيانات قيد التشغيل عن بعد' });
  } catch (err) { res.status(500).json({ error: `فشل النسخ الاحتياطي: ${err.message}` }); }
});

router.get('/backups', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM backups ORDER BY created_at DESC');
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'المفتاح مطلوب' });
    await execute('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
    res.json({ message: 'تم حفظ الإعداد' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const total = (await queryOne('SELECT COUNT(*) as c FROM publish_logs'))?.c || 0;
    const rows = await query('SELECT pl.*, c.username as channel_username, a.name as account_name, u.username as user_username FROM publish_logs pl LEFT JOIN channels c ON pl.channel_id = c.id LEFT JOIN accounts a ON pl.account_id = a.id LEFT JOIN users u ON pl.user_id = u.id ORDER BY pl.created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    res.json({ logs: rows.rows, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/system/restart', async (req, res) => {
  const sched = require('../services/scheduler');
  sched.stopAll(); sched.start();
  await execute("INSERT INTO publish_logs (action, status, details, user_id) VALUES ($1, $2, $3, $4)", ['system', 'success', 'تم إعادة تشغيل النظام', req.user.id]);
  res.json({ message: '✓ تم إعادة تشغيل النظام' });
});

router.post('/system/stop', async (req, res) => {
  const sched = require('../services/scheduler');
  sched.stopAll();
  await execute("UPDATE accounts SET status = 'disconnected' WHERE status = 'connected'");
  await execute("INSERT INTO publish_logs (action, status, details, user_id) VALUES ($1, $2, $3, $4)", ['system', 'info', 'تم إيقاف النظام', req.user.id]);
  res.json({ message: 'تم إيقاف النظام' });
});

module.exports = router;
