const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, queryOne, execute } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({ destination: (req, file, cb) => cb(null, uploadDir), filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`) });
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM messages WHERE user_id = $1 OR $2 = 1 ORDER BY created_at DESC', [req.user.id, req.user.role === 'admin' ? 1 : 0]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { content, msg_type, buttons, parse_mode, channel_id, account_id } = req.body;
    if (!content && msg_type !== 'poll') return res.status(400).json({ error: 'محتوى الرسالة مطلوب' });
    const r = await execute('INSERT INTO messages (content, msg_type, buttons, parse_mode, channel_id, account_id, user_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [content || '', msg_type || 'text', buttons || null, parse_mode || 'HTML', channel_id || null, account_id || null, req.user.id, 'draft']);
    const message = r.rows ? r.rows[0] : await queryOne('SELECT * FROM messages WHERE id = (SELECT last_insert_rowid())');
    res.json({ message, message_id: message.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send', authenticate, async (req, res) => {
  try {
    const { message_id, channel_id, account_id } = req.body;
    if (!message_id || !channel_id || !account_id) return res.status(400).json({ error: 'بيانات ناقصة' });

    const message = await queryOne('SELECT * FROM messages WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [message_id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    const channel = await queryOne('SELECT * FROM channels WHERE id = $1', [channel_id]);
    if (!channel) return res.status(404).json({ error: 'القناة غير موجودة' });
    const account = await queryOne('SELECT * FROM accounts WHERE id = $1 AND is_active = 1', [account_id]);
    if (!account) return res.status(400).json({ error: 'الحساب غير موجود أو غير نشط' });

    const result = await telegram.sendMessage(account, channel.username, { content: message.content, msg_type: message.msg_type, file_path: message.file_path, buttons: message.buttons, parse_mode: message.parse_mode });

    if (result.success) {
      await execute("UPDATE messages SET status = 'sent', sent_at = datetime('now'), channel_id = $1, account_id = $2 WHERE id = $3", [channel_id, account_id, message_id]);
      await execute("UPDATE channels SET last_publish = datetime('now') WHERE id = $1", [channel_id]);
      await execute('INSERT INTO publish_logs (action, status, details, channel_id, account_id, user_id) VALUES ($1, $2, $3, $4, $5, $6)', ['publish', 'success', `تم النشر في ${channel.username}`, channel_id, account_id, req.user.id]);
      res.json({ success: true, result, message: '✓ تم إرسال الرسالة بنجاح' });
    } else {
      await execute('INSERT INTO publish_logs (action, status, details, error, channel_id, account_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', ['publish', 'error', `فشل النشر في ${channel.username}`, result.error, channel_id, account_id, req.user.id]);
      res.status(500).json({ success: false, error: result.error, message: '✗ فشل الإرسال' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' });
  res.json({ file_path: req.file.path, filename: req.file.originalname, size: req.file.size });
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const message = await queryOne('SELECT * FROM messages WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    const { content, msg_type, buttons, parse_mode, status } = req.body;
    await execute('UPDATE messages SET content = COALESCE($1, content), msg_type = COALESCE($2, msg_type), buttons = COALESCE($3, buttons), parse_mode = COALESCE($4, parse_mode), status = COALESCE($5, status) WHERE id = $6', [content || null, msg_type || null, buttons || null, parse_mode || null, status || null, req.params.id]);
    const updated = await queryOne('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    res.json({ message: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const message = await queryOne('SELECT * FROM messages WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' });
    await execute('DELETE FROM messages WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم حذف الرسالة' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
