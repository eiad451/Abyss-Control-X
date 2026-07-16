const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const scheduler = require('../services/scheduler');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const schedules = db.prepare(`
    SELECT s.*, m.content as message_content, m.msg_type,
           c.username as channel_username, c.title as channel_title,
           a.name as account_name
    FROM schedules s
    JOIN messages m ON s.message_id = m.id
    JOIN channels c ON s.channel_id = c.id
    JOIN accounts a ON s.account_id = a.id
    WHERE s.user_id = ? OR ? = 1
    ORDER BY s.created_at DESC
  `).all(req.user.id, req.user.role === 'admin' ? 1 : 0);
  res.json(schedules);
});

router.post('/', authenticate, (req, res) => {
  const { message_id, channel_id, account_id, frequency, cron_expr, specific_date, specific_days } = req.body;
  if (!message_id || !channel_id || !account_id) {
    return res.status(400).json({ error: 'message_id, channel_id, account_id مطلوبة' });
  }
  if (!frequency && !cron_expr && !specific_date) {
    return res.status(400).json({ error: 'يجب اختيار تكرار الجدولة' });
  }

  const id = scheduler.addSchedule({ message_id, channel_id, account_id, user_id: req.user.id, frequency, cron_expr, specific_date, specific_days });
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  db.prepare('UPDATE messages SET status = ? WHERE id = ?').run('scheduled', message_id);
  db.prepare('INSERT INTO publish_logs (action, status, details, channel_id, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?)').run('schedule_created', 'success', `تمت جدولة رسالة`, channel_id, account_id, req.user.id);

  res.json({ schedule, message: '✓ تمت الجدولة بنجاح' });
});

router.put('/:id', authenticate, (req, res) => {
  const { is_active, frequency, cron_expr, specific_date, specific_days } = req.body;
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!sched) return res.status(404).json({ error: 'الجدولة غير موجودة' });

  if (is_active !== undefined) {
    if (is_active) {
      db.prepare('UPDATE schedules SET is_active = 1 WHERE id = ?').run(req.params.id);
      const fullSched = db.prepare(`
        SELECT s.*, m.content, m.msg_type, m.file_path, m.buttons, m.parse_mode,
               c.username as channel_username, c.id as channel_id,
               a.type as account_type, a.token, a.api_id, a.api_hash, a.session_string
        FROM schedules s
        JOIN messages m ON s.message_id = m.id
        JOIN channels c ON s.channel_id = c.id
        JOIN accounts a ON s.account_id = a.id
        WHERE s.id = ?
      `).get(req.params.id);
      if (fullSched) scheduler.scheduleJob(fullSched);
    } else {
      scheduler.removeSchedule(parseInt(req.params.id));
    }
  }

  res.json({ message: 'تم تحديث الجدولة' });
});

router.delete('/:id', authenticate, (req, res) => {
  const sched = db.prepare('SELECT * FROM schedules WHERE id = ? AND (user_id = ? OR ? = 1)').get(req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0);
  if (!sched) return res.status(404).json({ error: 'الجدولة غير موجودة' });
  scheduler.removeSchedule(parseInt(req.params.id));
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  res.json({ message: 'تم حذف الجدولة' });
});

module.exports = router;
