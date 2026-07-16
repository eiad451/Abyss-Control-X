const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate Limit', message: 'طلبات كثيرة جداً. حاول بعد دقيقة.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Rate Limit', message: 'محاولات دخول كثيرة. حاول بعد 15 دقيقة.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { limiter, authLimiter };
