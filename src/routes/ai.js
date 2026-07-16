const express = require('express');
const { authenticate } = require('../middleware/auth');
const ai = require('../services/ai');

const router = express.Router();

router.post('/suggest', authenticate, (req, res) => {
  const { type, text } = req.body;
  let result;

  switch (type) {
    case 'time':
      result = ai.suggestBestTime();
      break;
    case 'rewrite':
      result = ai.rewriteAd(text || '');
      break;
    case 'hashtag':
      result = ai.generateHashtags(text || '');
      break;
    case 'title':
      result = ai.generateTitle(text || '');
      break;
    case 'translate':
      result = ai.translateAd(text || '', 'en');
      break;
    default:
      return res.status(400).json({ error: 'نوع غير مدعوم' });
  }

  res.json({ type, result });
});

module.exports = router;
