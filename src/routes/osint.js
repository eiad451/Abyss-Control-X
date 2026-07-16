const express = require('express');
const osint = require('../../osint/osint');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/phone', authenticate, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'الرجاء إدخال رقم الهاتف' });
    const result = await osint.resolvePhone(phone);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/check', authenticate, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'الرجاء إدخال رقم الهاتف' });
    const result = await osint.checkPhone(phone);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/username', authenticate, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'الرجاء إدخال اسم المستخدم' });
    const result = await osint.getByUsername(username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
