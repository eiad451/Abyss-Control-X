const cron = require('node-cron');
const { query, queryOne, execute } = require('../database/db');
const telegram = require('./telegram');

const jobs = new Map();

const FREQ_CRON = { '1m': '* * * * *', '5m': '*/5 * * * *', '15m': '*/15 * * * *', '30m': '*/30 * * * *', '1h': '0 * * * *', '6h': '0 */6 * * *', '12h': '0 */12 * * *', '1d': '0 0 * * *', '1w': '0 0 * * 0' };

async function start() {
  const rows = await query('SELECT s.*, m.content, m.msg_type, m.file_path, m.buttons, m.parse_mode, c.username as channel_username, c.id as channel_id, a.type as account_type, a.token, a.api_id, a.api_hash, a.session_string FROM schedules s JOIN messages m ON s.message_id = m.id JOIN channels c ON s.channel_id = c.id JOIN accounts a ON s.account_id = a.id WHERE s.is_active = 1');
  for (const sched of rows.rows) scheduleJob(sched);
  console.log(`[Scheduler] Started ${jobs.size} scheduled jobs`);
}

function scheduleJob(sched) {
  if (jobs.has(sched.id)) { const j = jobs.get(sched.id); if (j.stop) j.stop(); else clearTimeout(j); jobs.delete(sched.id); }
  let cronExpr = sched.cron_expr || FREQ_CRON[sched.frequency];
  if (sched.specific_date) {
    const diff = new Date(sched.specific_date).getTime() - Date.now();
    if (diff > 0) { const t = setTimeout(() => { executeJob(sched); jobs.delete(sched.id); execute("UPDATE schedules SET is_active = 0 WHERE id = $1", [sched.id]); }, diff); jobs.set(sched.id, t); }
    return;
  }
  if (sched.specific_days) {
    const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const nums = JSON.parse(sched.specific_days).map(d => dayMap[d.toLowerCase()] !== undefined ? dayMap[d.toLowerCase()] : parseInt(d)).filter(n => !isNaN(n));
    if (nums.length && cronExpr) { const p = cronExpr.split(' '); if (p.length === 5) { p[4] = nums.join(','); cronExpr = p.join(' '); } }
  }
  if (!cronExpr || !cron.validate(cronExpr)) return console.error(`[Scheduler] Invalid cron: ${cronExpr}`);
  jobs.set(sched.id, cron.schedule(cronExpr, () => executeJob(sched)));
  execute("UPDATE schedules SET next_run = datetime('now') WHERE id = $1", [sched.id]);
}

async function executeJob(sched) {
  try {
    const account = { type: sched.account_type, token: sched.token, api_id: sched.api_id, api_hash: sched.api_hash, session_string: sched.session_string, id: sched.account_id };
    const result = await telegram.sendMessage(account, sched.channel_username, { content: sched.content, msg_type: sched.msg_type, file_path: sched.file_path, buttons: sched.buttons, parse_mode: sched.parse_mode });
    if (result.success) {
      await execute("UPDATE schedules SET last_run = datetime('now') WHERE id = $1", [sched.id]);
      await execute("INSERT INTO publish_logs (action, status, details, channel_id, account_id) VALUES ($1, $2, $3, $4, $5)", ['scheduled_publish', 'success', `تم النشر في ${sched.channel_username}`, sched.channel_id, sched.account_id]);
      await execute("UPDATE channels SET last_publish = datetime('now') WHERE id = $1", [sched.channel_id]);
    } else {
      await execute("INSERT INTO publish_logs (action, status, details, error, channel_id, account_id) VALUES ($1, $2, $3, $4, $5, $6)", ['scheduled_publish', 'error', `فشل النشر في ${sched.channel_username}`, result.error, sched.channel_id, sched.account_id]);
    }
  } catch (err) { console.error(`[Scheduler] Job ${sched.id} error:`, err.message); }
}

async function addSchedule(scheduleData) {
  const { message_id, channel_id, account_id, user_id, frequency, cron_expr, specific_date, specific_days } = scheduleData;
  await execute('INSERT INTO schedules (frequency, cron_expr, specific_date, specific_days, is_active, message_id, channel_id, account_id, user_id) VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)', [frequency || null, cron_expr || null, specific_date || null, specific_days ? JSON.stringify(specific_days) : null, message_id, channel_id, account_id, user_id]);
  const sched = await queryOne('SELECT s.*, m.content, m.msg_type, m.file_path, m.buttons, m.parse_mode, c.username as channel_username, c.id as channel_id, a.type as account_type, a.token, a.api_id, a.api_hash, a.session_string FROM schedules s JOIN messages m ON s.message_id = m.id JOIN channels c ON s.channel_id = c.id JOIN accounts a ON s.account_id = a.id WHERE s.id = (SELECT last_insert_rowid())');
  if (sched) scheduleJob(sched);
  return sched?.id;
}

function removeSchedule(id) {
  if (jobs.has(id)) { const j = jobs.get(id); if (j.stop) j.stop(); else clearTimeout(j); jobs.delete(id); }
  execute("UPDATE schedules SET is_active = 0 WHERE id = $1", [id]);
}

function stopAll() { for (const [, j] of jobs) { if (j.stop) j.stop(); else clearTimeout(j); } jobs.clear(); }

module.exports = { start, addSchedule, removeSchedule, stopAll, scheduleJob };
