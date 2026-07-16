const express = require('express');
const { query, queryOne, execute } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM accounts WHERE user_id = $1 OR user_id IS NULL ORDER BY created_at DESC', [req.user.id]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, type, token, api_id, api_hash, session_string, phone } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'الاسم والنوع مطلوبان' });
    if (type === 'bot' && !token) return res.status(400).json({ error: 'Bot Token مطلوب' });
    if (type === 'user' && (!api_id || !api_hash)) return res.status(400).json({ error: 'API ID و API Hash مطلوبان' });

    const r = await execute('INSERT INTO accounts (name, type, token, api_id, api_hash, session_string, phone, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [name, type, token || null, api_id || null, api_hash || null, session_string || null, phone || null, req.user.id]);
    const account = r.rows ? r.rows[0] : await queryOne('SELECT * FROM accounts WHERE id = last_insert_rowid()');
    res.json({ account, message: 'تم إضافة الحساب بنجاح' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const account = await queryOne('SELECT * FROM accounts WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
    const { name, token, api_id, api_hash, session_string, phone, is_active } = req.body;
    await execute('UPDATE accounts SET name = COALESCE($1, name), token = COALESCE($2, token), api_id = COALESCE($3, api_id), api_hash = COALESCE($4, api_hash), session_string = COALESCE($5, session_string), phone = COALESCE($6, phone), is_active = COALESCE($7, is_active) WHERE id = $8', [name || null, token || null, api_id || null, api_hash || null, session_string || null, phone || null, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id]);
    const updated = await queryOne('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
    res.json({ account: updated, message: 'تم تحديث الحساب' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const account = await queryOne('SELECT * FROM accounts WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });
    telegram.disconnectAccount(account.id);
    await execute('DELETE FROM accounts WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم حذف الحساب' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/test', authenticate, async (req, res) => {
  try {
    const { type, token, api_id, api_hash } = req.body;
    if (type === 'bot') {
      const result = await telegram.verifyBotToken(token);
      if (result.valid) res.json({ status: 'connected', ...result, message: '✓ تم الاتصال بنجاح' });
      else res.status(400).json({ status: 'error', error: result.error, message: '✗ فشل الاتصال' });
    } else {
      res.json({ status: 'testing', message: 'جاري اختبار اتصال الحساب الشخصي...' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/disconnect', authenticate, (req, res) => {
  telegram.disconnectAccount(req.params.id);
  res.json({ message: 'تم قطع الاتصال' });
});

module.exports = router;
