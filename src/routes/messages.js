const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const telegram = require('../services/telegram');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.get('/', authenticate, (req, res) => {
  const messages = db.prepare('SELECT * FROM messages WHERE user_id = ? OR ? = 1 ORDER BY created_at DESC').all(req.user.id, req.user.role === 'admin' ? 1 : 0);
  res.json(messages);
});

router.post('/', authenticate, (req, res) => {
  const { content, msg_type, buttons, parse_mode, channel_id, account_id } = req.body;
  if (!content && msg_type !== 'poll') {
    return res.status(400).json({ error: 'محتوى الرسالة مطلوب' });
  }

  const result = db.prepare(`
    INSERT INTO messages (content, msg_type, buttons, parse_mode, channel_id, account_id, user_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(content || '', msg_type || 'text', buttons || null, parse_mode || 'HTML', channel_id || null, account_id || null, req.user.id);

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  res.json({ message, message_id: result.lastInsertRowid });
});

router.post('/send', authenticate, async (req, res) => {
  const { message_id, channel_id, account_id } = req.body;
  if (!message_id || !channel_id || !account_id) {
    return res.status(400).json({ error: 'بيانات ناقصة: message_id, channel_id, account_id' });
  }

  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND (user_id = ? OR ? = 1)').get(message_id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel_id);
  if (!channel) return res.status(404).json({ error: 'القناة غير موجودة' });

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND is_active = 1').get(account_id);
  if (!account) return res.status(400).json({ error: 'الحساب غير موجود أو غير نشط' });

  const msgData = {
    content: message.content,
    msg_type: message.msg_type,
    file_path: message.file_path,
    buttons: message.buttons,
    parse_mode: message.parse_mode,
  };

  const result = await telegram.sendMessage(account, channel.username, msgData);

  if (result.success) {
    db.prepare('UPDATE messages SET status = ?, sent_at = datetime(\'now\'), channel_id = ?, account_id = ? WHERE id = ?').run('sent', channel_id, account_id, message_id);
    db.prepare('UPDATE channels SET last_publish = datetime(\'now\') WHERE id = ?').run(channel_id);
    db.prepare('INSERT INTO publish_logs (action, status, details, channel_id, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?)').run('publish', 'success', `تم النشر في ${channel.username}`, channel_id, account_id, req.user.id);
    res.json({ success: true, result, message: '✓ تم إرسال الرسالة بنجاح' });
  } else {
    db.prepare('INSERT INTO publish_logs (action, status, details, error, channel_id, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run('publish', 'error', `فشل النشر في ${channel.username}`, result.error, channel_id, account_id, req.user.id);
    res.status(500).json({ success: false, error: result.error, message: '✗ فشل الإرسال' });
  }
});

router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'الملف مطلوب' });
  res.json({ file_path: req.file.path, filename: req.file.originalname, size: req.file.size });
});

router.put('/:id', authenticate, (req, res) => {
  const { content, msg_type, buttons, parse_mode, status } = req.body;
  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' });

  db.prepare(`
    UPDATE messages SET content = COALESCE(?, content), msg_type = COALESCE(?, msg_type),
    buttons = COALESCE(?, buttons), parse_mode = COALESCE(?, parse_mode), status = COALESCE(?, status)
    WHERE id = ?
  `).run(content || null, msg_type || null, buttons || null, parse_mode || null, status || null, req.params.id);

  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  res.json({ message: updated });
});

router.delete('/:id', authenticate, (req, res) => {
  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!message) return res.status(404).json({ error: 'الرسالة غير موجودة' });
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف الرسالة' });
});

module.exports = router;
