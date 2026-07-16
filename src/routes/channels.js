const express = require('express');
const { query, queryOne, execute } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT ch.*, a.name as account_name, a.type as account_type FROM channels ch LEFT JOIN accounts a ON ch.account_id = a.id WHERE ch.user_id = $1 OR $2 = 1 ORDER BY ch.created_at DESC', [req.user.id, req.user.role === 'admin' ? 1 : 0]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { username, account_id } = req.body;
    if (!username || !account_id) return res.status(400).json({ error: 'يُرجى إدخال اسم القناة واختيار حساب' });

    const account = await queryOne('SELECT * FROM accounts WHERE id = $1 AND is_active = 1', [account_id]);
    if (!account) return res.status(400).json({ error: 'الحساب غير موجود أو غير نشط' });

    let cleanUsername = username.trim();
    if (cleanUsername.includes('t.me/')) cleanUsername = cleanUsername.split('t.me/').pop();
    if (!cleanUsername.startsWith('@')) cleanUsername = '@' + cleanUsername.replace(/^@+/, '');

    let result;
    if (account.type === 'bot') result = await telegram.verifyChannel(cleanUsername, account.token);
    else return res.status(400).json({ error: 'التحقق متاح فقط لحسابات البوت حالياً' });

    if (!result.verified) return res.status(400).json({ error: result.message, step: result.step });

    const existing = await queryOne('SELECT id FROM channels WHERE username = $1', [cleanUsername]);
    if (existing) {
      await execute('UPDATE channels SET is_active = 1, account_id = $1 WHERE id = $2', [account_id, existing.id]);
      const channel = await queryOne('SELECT * FROM channels WHERE id = $1', [existing.id]);
      return res.json({ channel, message: 'تم تحديث القناة', verified: true, data: result.data });
    }

    const r = await execute('INSERT INTO channels (username, title, type, members, photo, is_verified, is_active, account_id, user_id) VALUES ($1, $2, $3, $4, $5, 1, 1, $6, $7) RETURNING *', [cleanUsername, result.data.title, result.data.type, result.data.members, result.data.photo ? 1 : 0, account_id, req.user.id]);
    const channel = r.rows ? r.rows[0] : await queryOne('SELECT * FROM channels WHERE id = (SELECT last_insert_rowid())');
    await execute('INSERT INTO publish_logs (action, status, details, channel_id, account_id, user_id) VALUES ($1, $2, $3, $4, $5, $6)', ['channel_added', 'success', `تم إضافة القناة ${cleanUsername}`, channel.id, account_id, req.user.id]);
    res.json({ channel, message: '✓ تم إضافة القناة بنجاح', verified: true, data: result.data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/verify', authenticate, async (req, res) => {
  try {
    const { username, account_id } = req.body;
    if (!username || !account_id) return res.status(400).json({ error: 'بيانات ناقصة' });
    const account = await queryOne('SELECT * FROM accounts WHERE id = $1', [account_id]);
    if (!account) return res.status(400).json({ error: 'الحساب غير موجود' });
    let cleanUsername = username.trim();
    if (cleanUsername.includes('t.me/')) cleanUsername = cleanUsername.split('t.me/').pop();
    if (!cleanUsername.startsWith('@')) cleanUsername = '@' + cleanUsername.replace(/^@+/, '');
    const result = account.type === 'bot' ? await telegram.verifyChannel(cleanUsername, account.token) : null;
    if (!result) return res.status(400).json({ error: 'التحقق متاح فقط لحسابات البوت' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const channel = await queryOne('SELECT * FROM channels WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!channel) return res.status(404).json({ error: 'القناة غير موجودة' });
    const { is_active } = req.body;
    await execute('UPDATE channels SET is_active = $1 WHERE id = $2', [is_active ? 1 : 0, req.params.id]);
    res.json({ message: is_active ? 'تم تفعيل القناة' : 'تم إيقاف القناة' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const channel = await queryOne('SELECT * FROM channels WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!channel) return res.status(404).json({ error: 'القناة غير موجودة' });
    await execute('DELETE FROM channels WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم حذف القناة' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
