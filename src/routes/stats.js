const express = require('express');
const db = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const totalAccounts = db.prepare('SELECT COUNT(*) as c FROM accounts').get().c;
  const activeAccounts = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE is_active = 1 AND status = ?').get('connected').c;
  const totalChannels = db.prepare('SELECT COUNT(*) as c FROM channels').get().c;
  const activeChannels = db.prepare('SELECT COUNT(*) as c FROM channels WHERE is_active = 1').get().c;
  const totalMessages = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
  const sentMessages = db.prepare('SELECT COUNT(*) as c FROM messages WHERE status = ?').get('sent').c;
  const scheduledCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE status = ?').get('scheduled').c;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalGroups = 15;

  const successLogs = db.prepare("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'success'").get().c;
  const errorLogs = db.prepare("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'error'").get().c;
  const totalLogs = successLogs + errorLogs;
  const successRate = totalLogs > 0 ? Math.round((successLogs / totalLogs) * 1000) / 10 : 100;

  const recentLogs = db.prepare(`
    SELECT pl.*, c.username as channel_username
    FROM publish_logs pl
    LEFT JOIN channels c ON pl.channel_id = c.id
    ORDER BY pl.created_at DESC LIMIT 20
  `).all();

  const todayStr = new Date().toISOString().split('T')[0];
  const todaySent = db.prepare("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'success' AND date(created_at) = ?").get(todayStr).c;
  const todayErrors = db.prepare("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'error' AND date(created_at) = ?").get(todayStr).c;

  const weekData = [];
  const days = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const sent = db.prepare("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'success' AND date(created_at) = ?").get(ds).c;
    const err = db.prepare("SELECT COUNT(*) as c FROM publish_logs WHERE status = 'error' AND date(created_at) = ?").get(ds).c;
    weekData.push({ day: days[6 - i] || ds, sent, errors: err });
  }

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
});

router.get('/admin', authenticate, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, is_active, subscription_ends, created_at, last_login FROM users').all();
  const accounts = db.prepare('SELECT * FROM accounts').all();
  const channels = db.prepare('SELECT * FROM channels').all();
  const loginHistory = db.prepare('SELECT * FROM login_history ORDER BY created_at DESC LIMIT 50').all();
  const settings = db.prepare('SELECT * FROM settings').all();
  const backups = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all();

  const settingsObj = {};
  for (const s of settings) settingsObj[s.key] = s.value;

  res.json({ users, accounts, channels, loginHistory, settings: settingsObj, backups });
});

module.exports = router;
