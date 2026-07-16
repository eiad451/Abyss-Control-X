const express = require('express');
const bcrypt = require('bcryptjs');
const { queryOne, execute } = require('../database/db');
const { generateToken, authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });

    const user = await queryOne('SELECT * FROM users WHERE username = $1', [username]);
    if (!user) {
      await execute('INSERT INTO login_history (ip, device, status, user_id) VALUES ($1, $2, $3, $4)', [req.ip, req.headers['user-agent'] || 'unknown', 'failed', 0]);
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      await execute('INSERT INTO login_history (ip, device, status, user_id) VALUES ($1, $2, $3, $4)', [req.ip, req.headers['user-agent'] || 'unknown', 'failed', user.id]);
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }

    if (!user.is_active) return res.status(403).json({ error: 'الحساب غير نشط. تواصل مع الأدمن.' });

    await execute("UPDATE users SET last_login = datetime('now') WHERE id = $1", [user.id]);
    await execute('INSERT INTO login_history (ip, device, status, user_id) VALUES ($1, $2, $3, $4)', [req.ip, req.headers['user-agent'] || 'unknown', 'success', user.id]);

    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role }, message: 'تم تسجيل الدخول بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!bcrypt.compareSync(oldPassword, user.password)) return res.status(400).json({ error: 'كلمة المرور القديمة غير صحيحة' });
    const hash = bcrypt.hashSync(newPassword, 10);
    await execute('UPDATE users SET password = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
