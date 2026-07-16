const cron = require('node-cron');
const db = require('../database/db');
const telegram = require('./telegram');

const jobs = new Map();

const FREQ_CRON = {
  '1m': '* * * * *',
  '5m': '*/5 * * * *',
  '15m': '*/15 * * * *',
  '30m': '*/30 * * * *',
  '1h': '0 * * * *',
  '6h': '0 */6 * * *',
  '12h': '0 */12 * * *',
  '1d': '0 0 * * *',
  '1w': '0 0 * * 0',
};

function start() {
  const schedules = db.prepare(`
    SELECT s.*, m.content, m.msg_type, m.file_path, m.buttons, m.parse_mode,
           c.username as channel_username, c.id as channel_id,
           a.type as account_type, a.token, a.api_id, a.api_hash, a.session_string
    FROM schedules s
    JOIN messages m ON s.message_id = m.id
    JOIN channels c ON s.channel_id = c.id
    JOIN accounts a ON s.account_id = a.id
    WHERE s.is_active = 1
  `).all();

  for (const sched of schedules) {
    scheduleJob(sched);
  }
  console.log(`[Scheduler] Started ${jobs.size} scheduled jobs`);
}

function scheduleJob(sched) {
  if (jobs.has(sched.id)) {
    jobs.get(sched.id).stop();
    jobs.delete(sched.id);
  }

  let cronExpr = sched.cron_expr;

  if (!cronExpr && sched.frequency) {
    cronExpr = FREQ_CRON[sched.frequency];
  }

  if (sched.specific_date) {
    const date = new Date(sched.specific_date);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    if (diff > 0) {
      const job = setTimeout(async () => {
        await executeJob(sched);
        jobs.delete(sched.id);
        db.prepare('UPDATE schedules SET is_active = 0, last_run = datetime(\'now\') WHERE id = ?').run(sched.id);
      }, diff);
      jobs.set(sched.id, job);
    }
    return;
  }

  if (sched.specific_days) {
    const days = JSON.parse(sched.specific_days);
    const dayMap = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };
    const nums = days.map(d => dayMap[d.toLowerCase()] !== undefined ? dayMap[d.toLowerCase()] : parseInt(d)).filter(n => !isNaN(n));
    if (nums.length > 0 && cronExpr) {
      const parts = cronExpr.split(' ');
      if (parts.length === 5) {
        parts[4] = nums.join(',');
        cronExpr = parts.join(' ');
      }
    }
  }

  if (!cronExpr || !cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron for job ${sched.id}: ${cronExpr}`);
    return;
  }

  const task = cron.schedule(cronExpr, async () => {
    await executeJob(sched);
  });
  jobs.set(sched.id, task);
  db.prepare('UPDATE schedules SET next_run = datetime(\'now\', ?) WHERE id = ?').run(getNextDelta(sched.frequency), sched.id);
}

function getNextDelta(freq) {
  const map = { '1m': '+1 minute', '5m': '+5 minutes', '15m': '+15 minutes', '30m': '+30 minutes', '1h': '+1 hour', '6h': '+6 hours', '12h': '+12 hours', '1d': '+1 day', '1w': '+1 week' };
  return map[freq] || '+1 hour';
}

async function executeJob(sched) {
  try {
    const account = { type: sched.account_type, token: sched.token, api_id: sched.api_id, api_hash: sched.api_hash, session_string: sched.session_string, id: sched.account_id };
    const msgData = {
      content: sched.content,
      msg_type: sched.msg_type,
      file_path: sched.file_path,
      buttons: sched.buttons,
      parse_mode: sched.parse_mode,
    };

    const result = await telegram.sendMessage(account, sched.channel_username, msgData);

    if (result.success) {
      db.prepare('UPDATE schedules SET last_run = datetime(\'now\') WHERE id = ?').run(sched.id);
      db.prepare('INSERT INTO publish_logs (action, status, details, channel_id, account_id) VALUES (?, ?, ?, ?, ?)').run('scheduled_publish', 'success', `تم النشر في ${sched.channel_username}`, sched.channel_id, sched.account_id);
      db.prepare('UPDATE channels SET last_publish = datetime(\'now\') WHERE id = ?').run(sched.channel_id);
    } else {
      db.prepare('INSERT INTO publish_logs (action, status, details, error, channel_id, account_id) VALUES (?, ?, ?, ?, ?, ?)').run('scheduled_publish', 'error', `فشل النشر في ${sched.channel_username}`, result.error, sched.channel_id, sched.account_id);
    }
  } catch (err) {
    console.error(`[Scheduler] Job ${sched.id} error:`, err.message);
  }
}

function addSchedule(scheduleData) {
  const { message_id, channel_id, account_id, user_id, frequency, cron_expr, specific_date, specific_days } = scheduleData;
  const result = db.prepare(`
    INSERT INTO schedules (frequency, cron_expr, specific_date, specific_days, is_active, message_id, channel_id, account_id, user_id)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(frequency || null, cron_expr || null, specific_date || null, specific_days ? JSON.stringify(specific_days) : null, message_id, channel_id, account_id, user_id);

  const sched = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);
  const fullSched = db.prepare(`
    SELECT s.*, m.content, m.msg_type, m.file_path, m.buttons, m.parse_mode, c.username as channel_username, c.id as channel_id, a.type as account_type, a.token, a.api_id, a.api_hash, a.session_string
    FROM schedules s
    JOIN messages m ON s.message_id = m.id
    JOIN channels c ON s.channel_id = c.id
    JOIN accounts a ON s.account_id = a.id
    WHERE s.id = ?
  `).get(result.lastInsertRowid);

  if (fullSched) scheduleJob(fullSched);
  return result.lastInsertRowid;
}

function removeSchedule(id) {
  if (jobs.has(id)) {
    const job = jobs.get(id);
    if (typeof job === 'object' && job.stop) job.stop();
    else clearTimeout(job);
    jobs.delete(id);
  }
  db.prepare('UPDATE schedules SET is_active = 0 WHERE id = ?').run(id);
}

function stopAll() {
  for (const [id, job] of jobs) {
    if (typeof job === 'object' && job.stop) job.stop();
    else clearTimeout(job);
  }
  jobs.clear();
}

module.exports = { start, addSchedule, removeSchedule, stopAll, scheduleJob };
