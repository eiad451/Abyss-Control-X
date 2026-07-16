const express = require('express');
const { query, queryOne, execute } = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const totalAccounts = (await queryOne('SELECT COUNT(*) as c FROM accounts'))?.c || 0;
    const activeAccounts = (await queryOne("SELECT COUNT(*) as c FROM accounts WHERE is_active = 1 AND status = 'connected'"))?.c || 0;
    const totalChannels = (await queryOne('SELECT COUNT(*) as c FROM channels'))?.c || 0;
    const activeChannels = (await queryOne('SELECT COUNT(*) as c FROM channels WHERE is_active = 1'))?.c || 0;
    const totalMessages = (await queryOne('SELECT COUNT(*) as c FROM messages'))?.c || 0;
    const sentMessages = (await queryOne("SELECT COUNT(*) as c FROM messages WHERE status = 'sent'"))?.c || 0;
    const scheduledCount = (await queryOne("SELECT COUNT(*) as c FROM messages WHERE status = 'scheduled'"))?.c || 0;
    const totalUsers = (await queryOne('SELECT COUNT(*) as c FROM users'))?.c || 0;
    const totalGroups = 15;

    const successLogs = (await queryOne("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'success'"))?.c || 0;
    const errorLogs = (await queryOne("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'error'"))?.c || 0;
    const totalLogs = successLogs + errorLogs;
    const successRate = totalLogs > 0 ? Math.round((successLogs / totalLogs) * 1000) / 10 : 100;

    const recentRows = await query('SELECT pl.*, c.username as channel_username FROM publish_logs pl LEFT JOIN channels c ON pl.channel_id = c.id ORDER BY pl.created_at DESC LIMIT 20');
    const recentLogs = recentRows.rows || [];

    const now = new Date();
    const weekData = [];
    const days = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const sent = (await queryOne("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'success' AND created_at LIKE $1", [`${ds}%`]))?.c || 0;
      const err = (await queryOne("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'error' AND created_at LIKE $1", [`${ds}%`]))?.c || 0;
      weekData.push({ day: days[6 - i] || ds, sent, errors: err });
    }

    const todayStr = now.toISOString().split('T')[0];
    const todaySent = (await queryOne("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'success' AND created_at LIKE $1", [`${todayStr}%`]))?.c || 0;
    const todayErrors = (await queryOne("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'error' AND created_at LIKE $1", [`${todayStr}%`]))?.c || 0;

    res.json({
      accounts: { total: totalAccounts, active: activeAccounts },
      channels: { total: totalChannels, active: activeChannels },
      messages: { total: totalMessages, sent: sentMessages, scheduled: scheduledCount },
      users: { total: totalUsers },
      groups: { total: totalGroups },
      logs: { success: successLogs, errors: errorLogs, total: totalLogs },
      successRate,
      today: { sent: todaySent, errors: todayErrors },
      recentLogs,
      weeklyData: weekData,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = (await query('SELECT id, username, role, is_active, subscription_ends, created_at, last_login FROM users')).rows;
    const accounts = (await query('SELECT * FROM accounts')).rows;
    const channels = (await query('SELECT * FROM channels')).rows;
    const loginHistory = (await query('SELECT * FROM login_history ORDER BY created_at DESC LIMIT 50')).rows;
    const settingsRows = (await query('SELECT * FROM settings')).rows;
    const backups = (await query('SELECT * FROM backups ORDER BY created_at DESC')).rows;
    const settings = {};
    for (const s of settingsRows) settings[s.key] = s.value;
    res.json({ users, accounts, channels, loginHistory, settings, backups });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
