const rateLimit = require('express-rate-limit')

// 通用 API 限流：每 IP 15 分钟最多 100 次请求
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' })
  },
})

// OAuth 相关限流：更严格，防止暴力生成授权链接
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: '授权请求过于频繁，请稍后再试' })
  },
})

module.exports = { apiLimiter, authLimiter }
