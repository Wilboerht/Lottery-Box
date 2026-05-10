const express = require('express')
const axios = require('axios')
const crypto = require('crypto')
const router = express.Router()

const APP_KEY = process.env.XHS_APP_KEY
const APP_SECRET = process.env.XHS_APP_SECRET
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4173'

// 小红书 OAuth 端点
const XHS_OAUTH_AUTHORIZE = 'https://open.xiaohongshu.com/oauth/authorize'
const XHS_OAUTH_TOKEN = 'https://open.xiaohongshu.com/oauth/token'

// 回调地址（必须与开放平台配置的一致）
const REDIRECT_URI = `${FRONTEND_URL}/api/auth/callback`

/**
 * GET /api/auth/url
 * 获取小红书授权跳转 URL
 */
router.get('/url', (req, res) => {
  if (!APP_KEY) {
    return res.status(500).json({ success: false, message: '服务器未配置 XHS_APP_KEY' })
  }

  const state = generateState()
  req.session.oauthState = state

  const params = new URLSearchParams({
    client_id: APP_KEY,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'notes.read,comments.read',
    state,
  })

  const url = `${XHS_OAUTH_AUTHORIZE}?${params.toString()}`
  res.json({ success: true, url })
})

/**
 * GET /api/auth/callback
 * 小红书 OAuth 回调
 */
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description } = req.query

    if (error) {
      return res.redirect(`${FRONTEND_URL}/?auth=error&message=${encodeURIComponent(error_description || error)}`)
    }

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/?auth=error&message=授权失败，未返回授权码`)
    }

    // 校验 state 防止 CSRF
    if (state && state !== req.session.oauthState) {
      return res.redirect(`${FRONTEND_URL}/?auth=error&message=安全校验失败，请重新授权`)
    }
    delete req.session.oauthState

    // 用 auth_code 换取 access_token
    const tokenRes = await axios.post(XHS_OAUTH_TOKEN, {
      grant_type: 'authorization_code',
      code,
      client_id: APP_KEY,
      client_secret: APP_SECRET,
      redirect_uri: REDIRECT_URI,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    })

    const { access_token, refresh_token, expires_in } = tokenRes.data

    // Token 存入 session（不暴露给前端）
    req.session.xhsToken = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + (expires_in || 7200) * 1000,
    }

    res.redirect(`${FRONTEND_URL}/?auth=success`)
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message)
    const msg = err.response?.data?.message || '授权回调处理失败'
    res.redirect(`${FRONTEND_URL}/?auth=error&message=${encodeURIComponent(msg)}`)
  }
})

/**
 * POST /api/auth/refresh
 * 刷新 access_token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const tokenData = req.session.xhsToken
    if (!tokenData || !tokenData.refreshToken) {
      return res.status(401).json({ success: false, message: '未登录或刷新令牌已失效' })
    }

    const refreshRes = await axios.post(XHS_OAUTH_TOKEN, {
      grant_type: 'refresh_token',
      refresh_token: tokenData.refreshToken,
      client_id: APP_KEY,
      client_secret: APP_SECRET,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    })

    const { access_token, refresh_token, expires_in } = refreshRes.data

    req.session.xhsToken = {
      accessToken: access_token,
      refreshToken: refresh_token || tokenData.refreshToken,
      expiresAt: Date.now() + (expires_in || 7200) * 1000,
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Token refresh error:', err.response?.data || err.message)
    next(err)
  }
})

/**
 * GET /api/auth/me
 * 获取当前登录状态
 */
router.get('/me', (req, res) => {
  const tokenData = req.session.xhsToken
  if (!tokenData || !tokenData.accessToken) {
    return res.json({ success: false, loggedIn: false })
  }

  const isExpired = Date.now() >= tokenData.expiresAt
  res.json({
    success: true,
    loggedIn: true,
    expiresAt: tokenData.expiresAt,
    isExpired,
  })
})

/**
 * POST /api/auth/logout
 * 退出登录
 */
router.post('/logout', (req, res) => {
  delete req.session.xhsToken
  res.json({ success: true })
})

function generateState() {
  return crypto.randomBytes(16).toString('hex') + Date.now().toString(36)
}

module.exports = router
