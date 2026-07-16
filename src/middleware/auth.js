const jwt = require('jsonwebtoken');
const db = require('../database/db');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'abyss_control_x_jwt_secret';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'يرجى تسجيل الدخول أولاً' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, role, is_active FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Unauthorized', message: 'الحساب غير نشط' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized', message: 'انتهت صلاحية الجلسة' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'صلاحية مطلوبة: أدمن' });
  }
  next();
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = { authenticate, requireAdmin, generateToken };
