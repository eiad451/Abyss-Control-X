const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { generateToken, authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    db.prepare('INSERT INTO login_history (ip, device, status, user_id) VALUES (?, ?, ?, ?)').run(req.ip, req.headers['user-agent'] || 'unknown', 'failed', 0);
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    db.prepare('INSERT INTO login_history (ip, device, status, user_id) VALUES (?, ?, ?, ?)').run(req.ip, req.headers['user-agent'] || 'unknown', 'failed', user.id);
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'الحساب غير نشط. تواصل مع الأدمن.' });
  }

  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
  db.prepare('INSERT INTO login_history (ip, device, status, user_id) VALUES (?, ?, ?, ?)').run(req.ip, req.headers['user-agent'] || 'unknown', 'success', user.id);

  const token = generateToken(user);

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
    message: 'تم تسجيل الدخول بنجاح',
  });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ error: 'كلمة المرور القديمة غير صحيحة' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
});

module.exports = router;
