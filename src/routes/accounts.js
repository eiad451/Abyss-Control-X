const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC').all(req.user.id);
  res.json(accounts);
});

router.post('/', authenticate, (req, res) => {
  const { name, type, token, api_id, api_hash, session_string, phone } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'الاسم والنوع مطلوبان' });
  }
  if (type === 'bot' && !token) {
    return res.status(400).json({ error: 'Bot Token مطلوب للحسابات من نوع بوت' });
  }
  if (type === 'user' && (!api_id || !api_hash)) {
    return res.status(400).json({ error: 'API ID و API Hash مطلوبان للحسابات الشخصية' });
  }

  const result = db.prepare(`
    INSERT INTO accounts (name, type, token, api_id, api_hash, session_string, phone, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, type, token || null, api_id || null, api_hash || null, session_string || null, phone || null, req.user.id);

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  res.json({ account, message: 'تم إضافة الحساب بنجاح' });
});

router.put('/:id', authenticate, (req, res) => {
  const { name, token, api_id, api_hash, session_string, phone, is_active } = req.body;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });

  db.prepare(`
    UPDATE accounts SET name = COALESCE(?, name), token = COALESCE(?, token), api_id = COALESCE(?, api_id),
    api_hash = COALESCE(?, api_hash), session_string = COALESCE(?, session_string), phone = COALESCE(?, phone),
    is_active = COALESCE(?, is_active) WHERE id = ?
  `).run(name || null, token || null, api_id || null, api_hash || null, session_string || null, phone || null, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);

  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  res.json({ account: updated, message: 'تم تحديث الحساب' });
});

router.delete('/:id', authenticate, (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
  telegram.disconnectAccount(account.id);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف الحساب' });
});

router.post('/test', authenticate, async (req, res) => {
  const { type, token, api_id, api_hash } = req.body;
  if (type === 'bot') {
    const result = await telegram.verifyBotToken(token);
    if (result.valid) {
      res.json({ status: 'connected', ...result, message: '✓ تم الاتصال بنجاح' });
    } else {
      res.status(400).json({ status: 'error', error: result.error, message: '✗ فشل الاتصال' });
    }
  } else {
    res.json({ status: 'testing', message: 'جاري اختبار اتصال الحساب الشخصي...' });
  }
});

router.post('/:id/disconnect', authenticate, (req, res) => {
  telegram.disconnectAccount(req.params.id);
  res.json({ message: 'تم قطع الاتصال' });
});

module.exports = router;
