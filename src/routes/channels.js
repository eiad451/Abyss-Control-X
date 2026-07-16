const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const channels = db.prepare(`
    SELECT ch.*, a.name as account_name, a.type as account_type
    FROM channels ch
    LEFT JOIN accounts a ON ch.account_id = a.id
    WHERE ch.user_id = ? OR ? = 1
    ORDER BY ch.created_at DESC
  `).all(req.user.id, req.user.role === 'admin' ? 1 : 0);
  res.json(channels);
});

router.post('/', authenticate, async (req, res) => {
  const { username, account_id } = req.body;
  if (!username || !account_id) {
    return res.status(400).json({ error: 'يُرجى إدخال اسم القناة واختيار حساب' });
  }

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND is_active = 1').get(account_id);
  if (!account) return res.status(400).json({ error: 'الحساب غير موجود أو غير نشط' });

  let cleanUsername = username.trim();
  if (cleanUsername.includes('t.me/')) {
    cleanUsername = cleanUsername.split('t.me/').pop();
  }
  if (cleanUsername.startsWith('@')) cleanUsername = cleanUsername.substring(1);
  if (!cleanUsername.startsWith('@')) cleanUsername = '@' + cleanUsername;

  let result;
  if (account.type === 'bot') {
    result = await telegram.verifyChannel(cleanUsername, account.token);
  } else {
    return res.status(400).json({ error: 'التحقق متاح فقط لحسابات البوت حالياً' });
  }

  if (!result.verified) {
    return res.status(400).json({ error: result.message, step: result.step });
  }

  const existing = db.prepare('SELECT id FROM channels WHERE username = ?').get(cleanUsername);
  if (existing) {
    const updated = db.prepare('UPDATE channels SET is_active = 1, account_id = ? WHERE id = ?').run(account_id, existing.id);
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(existing.id);
    return res.json({ channel, message: 'تم تحديث القناة', verified: true, data: result.data });
  }

  const insert = db.prepare(`
    INSERT INTO channels (username, title, type, members, photo, is_verified, is_active, account_id, user_id)
    VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(cleanUsername, result.data.title, result.data.type, result.data.members, result.data.photo ? 1 : 0, account_id, req.user.id);

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(insert.lastInsertRowid);
  db.prepare('INSERT INTO publish_logs (action, status, details, channel_id, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?)').run('channel_added', 'success', `تم إضافة القناة ${cleanUsername}`, channel.id, account_id, req.user.id);

  res.json({ channel, message: '✓ تم إضافة القناة بنجاح', verified: true, data: result.data });
});

router.post('/verify', authenticate, async (req, res) => {
  const { username, account_id } = req.body;
  if (!username || !account_id) return res.status(400).json({ error: 'بيانات ناقصة' });

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
  if (!account) return res.status(400).json({ error: 'الحساب غير موجود' });

  let cleanUsername = username.trim();
  if (cleanUsername.includes('t.me/')) cleanUsername = cleanUsername.split('t.me/').pop();
  if (!cleanUsername.startsWith('@')) cleanUsername = '@' + cleanUsername.replace(/^@+/, '');

  let result;
  if (account.type === 'bot') {
    result = await telegram.verifyChannel(cleanUsername, account.token);
  } else {
    return res.status(400).json({ error: 'التحقق متاح فقط لحسابات البوت' });
  }

  res.json(result);
});

router.put('/:id', authenticate, (req, res) => {
  const { is_active } = req.body;
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!channel) return res.status(404).json({ error: 'القناة غير موجودة' });

  db.prepare('UPDATE channels SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
  res.json({ message: is_active ? 'تم تفعيل القناة' : 'تم إيقاف القناة' });
});

router.delete('/:id', authenticate, (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!channel) return res.status(404).json({ error: 'القناة غير موجودة' });
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف القناة' });
});

module.exports = router;
