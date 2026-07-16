const express = require('express');
const { query, queryOne, execute } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const scheduler = require('../services/scheduler');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT s.*, m.content as message_content, m.msg_type, c.username as channel_username, c.title as channel_title, a.name as account_name FROM schedules s JOIN messages m ON s.message_id = m.id JOIN channels c ON s.channel_id = c.id JOIN accounts a ON s.account_id = a.id WHERE s.user_id = $1 OR $2 = 1 ORDER BY s.created_at DESC', [req.user.id, req.user.role === 'admin' ? 1 : 0]);
    res.json(rows.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { message_id, channel_id, account_id, frequency, cron_expr, specific_date, specific_days } = req.body;
    if (!message_id || !channel_id || !account_id) return res.status(400).json({ error: 'message_id, channel_id, account_id مطلوبة' });
    if (!frequency && !cron_expr && !specific_date) return res.status(400).json({ error: 'يجب اختيار تكرار الجدولة' });

    const id = scheduler.addSchedule({ message_id, channel_id, account_id, user_id: req.user.id, frequency, cron_expr, specific_date, specific_days });
    const schedule = await queryOne('SELECT * FROM schedules WHERE id = $1', [id]);
    await execute("UPDATE messages SET status = 'scheduled' WHERE id = $1", [message_id]);
    await execute('INSERT INTO publish_logs (action, status, details, channel_id, account_id, user_id) VALUES ($1, $2, $3, $4, $5, $6)', ['schedule_created', 'success', 'تمت جدولة رسالة', channel_id, account_id, req.user.id]);
    res.json({ schedule, message: '✓ تمت الجدولة بنجاح' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const sched = await queryOne('SELECT * FROM schedules WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!sched) return res.status(404).json({ error: 'الجدولة غير موجودة' });
    const { is_active } = req.body;
    if (is_active !== undefined) {
      if (is_active) {
        await execute('UPDATE schedules SET is_active = 1 WHERE id = $1', [req.params.id]);
        const fullSched = await queryOne('SELECT s.*, m.content, m.msg_type, m.file_path, m.buttons, m.parse_mode, c.username as channel_username, c.id as channel_id, a.type as account_type, a.token, a.api_id, a.api_hash, a.session_string FROM schedules s JOIN messages m ON s.message_id = m.id JOIN channels c ON s.channel_id = c.id JOIN accounts a ON s.account_id = a.id WHERE s.id = $1', [req.params.id]);
        if (fullSched) scheduler.scheduleJob(fullSched);
      } else scheduler.removeSchedule(parseInt(req.params.id));
    }
    res.json({ message: 'تم تحديث الجدولة' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const sched = await queryOne('SELECT * FROM schedules WHERE id = $1 AND (user_id = $2 OR $3 = 1)', [req.params.id, req.user.id, req.user.role === 'admin' ? 1 : 0]);
    if (!sched) return res.status(404).json({ error: 'الجدولة غير موجودة' });
    scheduler.removeSchedule(parseInt(req.params.id));
    await execute('DELETE FROM schedules WHERE id = $1', [req.params.id]);
    res.json({ message: 'تم حذف الجدولة' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
