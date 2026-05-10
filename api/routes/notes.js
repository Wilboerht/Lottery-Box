const express = require('express')
const axios = require('axios')
const router = express.Router()

const XHS_API_BASE = 'https://open.xiaohongshu.com'
const APP_KEY = process.env.XHS_APP_KEY
const APP_SECRET = process.env.XHS_APP_SECRET

/**
 * GET /api/notes
 * 获取授权账号下的笔记列表
 */
router.get('/', async (req, res, next) => {
  try {
    const token = await getValidToken(req)
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录或授权已过期，请重新授权' })
    }

    const response = await axios.get(`${XHS_API_BASE}/api/v1/note/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        page: req.query.page || 1,
        page_size: req.query.page_size || 20,
      },
      timeout: 15000,
    })

    res.json({
      success: true,
      data: response.data,
    })
  } catch (err) {
    handleProxyError(err, res, next)
  }
})

/**
 * GET /api/notes/:id
 * 获取单条笔记详情
 */
router.get('/:id', async (req, res, next) => {
  try {
    const token = await getValidToken(req)
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录或授权已过期，请重新授权' })
    }

    const response = await axios.get(`${XHS_API_BASE}/api/v1/note/detail`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        note_id: req.params.id,
      },
      timeout: 15000,
    })

    res.json({
      success: true,
      data: response.data,
    })
  } catch (err) {
    handleProxyError(err, res, next)
  }
})

/**
 * 获取有效 token，过期时自动刷新
 */
async function getValidToken(req) {
  const tokenData = req.session?.xhsToken
  if (!tokenData || !tokenData.accessToken) return null

  // 提前 60 秒认为过期，避免临界值问题
  if (Date.now() >= tokenData.expiresAt - 60 * 1000) {
    if (!tokenData.refreshToken || !APP_KEY || !APP_SECRET) return null
    try {
      const refreshRes = await axios.post('https://open.xiaohongshu.com/oauth/token', {
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
      return access_token
    } catch (err) {
      console.error('Auto refresh token failed:', err.response?.data || err.message)
      return null
    }
  }

  return tokenData.accessToken
}

function handleProxyError(err, res, next) {
  console.error('XHS API proxy error:', err.response?.data || err.message)

  if (err.response) {
    const status = err.response.status
    if (status === 401) {
      return res.status(401).json({ success: false, message: '小红书授权已过期，请重新授权' })
    }
    return res.status(status).json({
      success: false,
      message: err.response.data?.message || '小红书 API 返回错误',
      detail: err.response.data,
    })
  }

  next(err)
}

module.exports = router
