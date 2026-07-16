require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const db = require('./src/database/db');
const scheduler = require('./src/services/scheduler');
const { limiter } = require('./src/middleware/rateLimit');

const authRoutes = require('./src/routes/auth');
const accountRoutes = require('./src/routes/accounts');
const channelRoutes = require('./src/routes/channels');
const messageRoutes = require('./src/routes/messages');
const scheduleRoutes = require('./src/routes/schedule');
const aiRoutes = require('./src/routes/ai');
const statsRoutes = require('./src/routes/stats');
const adminRoutes = require('./src/routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
const backupsDir = path.join(__dirname, 'backups');
const dataDir = path.join(__dirname, 'data');
const logsDir = path.join(__dirname, 'logs');

for (const dir of [uploadsDir, backupsDir, dataDir, logsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined', {
  stream: fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' }),
}));
app.use(morgan('dev'));
app.use(limiter);

app.use(express.static(__dirname));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    platform: 'Abyss Control X',
    developer: '𖤐 𝕬𝖇𝖞𝖘𝖘 𖤐',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: 'خطأ داخلي في الخادم', details: err.message });
});

scheduler.start();

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║        ABYSS CONTROL X v1.0.0            ║');
  console.log('  ║    Telegram Publishing Platform           ║');
  console.log('  ║    𖤐 𝕬𝖇𝖞𝖘𝖘 𖤐                        ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
  console.log(`  ✓ Server running on http://localhost:${PORT}`);
  console.log(`  ✓ API: http://localhost:${PORT}/api/health`);
  console.log('  ✓ Press Ctrl+C to stop');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n  Shutting down...');
  scheduler.stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  scheduler.stopAll();
  process.exit(0);
});
