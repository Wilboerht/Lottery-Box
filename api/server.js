const express = require('express')
const cors = require('cors')
const session = require('express-session')
const crypto = require('crypto')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const notesRoutes = require('./routes/notes')
const commentsRoutes = require('./routes/comments')
const { apiLimiter, authLimiter } = require('./middleware/rateLimit')

const app = express()
app.set('trust proxy', 1)
const PORT = process.env.PORT || 3000
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4173'

// 强制生产环境必须配置 SESSION_SECRET
const SESSION_SECRET = process.env.SESSION_SECRET
if (!SESSION_SECRET) {
  console.error('❌ 错误：生产环境必须设置 SESSION_SECRET 环境变量')
  process.exit(1)
}

// CORS：允许前端域名访问
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}))

app.use(express.json())

// Session 配置
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 国内服务器如未启用 HTTPS 设为 false
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 小时
  },
  name: 'xhs_session_id',
}))

// 健康检查（不受限流影响，放在限流前面）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// 限流与路由
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/notes', apiLimiter, notesRoutes)
app.use('/api/comments', apiLimiter, commentsRoutes)

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Lottery-Box 抽奖箱 API running on port ${PORT}`)
  console.log(`📍 Frontend URL: ${FRONTEND_URL}`)
})
