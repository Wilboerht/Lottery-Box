const express = require('express')
const axios = require('axios')
const router = express.Router()

const XHS_API_BASE = 'https://open.xiaohongshu.com'
const APP_KEY = process.env.XHS_APP_KEY
const APP_SECRET = process.env.XHS_APP_SECRET

/**
 * GET /api/comments/:noteId
 * 分页获取笔记评论（单页）
 */
router.get('/:noteId', async (req, res, next) => {
  try {
    const token = await getValidToken(req)
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录或授权已过期，请重新授权' })
    }

    const response = await axios.post(`${XHS_API_BASE}/api/v1/note/comment/list`, {
      note_id: req.params.noteId,
      cursor: req.query.cursor || '',
      limit: Math.min(parseInt(req.query.limit) || 20, 100),
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
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
 * GET /api/comments/:noteId/all
 * 自动分页拉取全部评论（后端聚合）
 * 返回：{ comments: [...], total: number }
 */
router.get('/:noteId/all', async (req, res, next) => {
  try {
    const token = await getValidToken(req)
    if (!token) {
      return res.status(401).json({ success: false, message: '未登录或授权已过期，请重新授权' })
    }

    const limit = Math.min(parseInt(req.query.limit) || 20, 100)
    const sinceId = req.query.since_id || ''
    const comments = []
    let cursor = ''
    let hasMore = true
    let total = 0
    let pages = 0

    while (hasMore) {
      const response = await axios.post(`${XHS_API_BASE}/api/v1/note/comment/list`, {
        note_id: req.params.noteId,
        cursor,
        limit,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })

      const data = response.data?.data || {}
      const pageComments = data.list || data.comments || []
      comments.push(...pageComments)

      total = data.total || comments.length
      hasMore = data.has_more !== false && pageComments.length === limit
      cursor = data.cursor || ''
      pages++

      // 安全限制：最多拉 50 页，防止无限循环
      if (pages >= 50) {
        hasMore = false
      }
    }

    // 如果提供了 since_id，过滤掉该评论及之后的评论（假设列表按时间倒序）
    let filteredComments = comments
    if (sinceId) {
      const cutoffIndex = comments.findIndex(c => (c.id || c.comment_id) === sinceId)
      if (cutoffIndex >= 0) {
        filteredComments = comments.slice(0, cutoffIndex)
      }
    }

    res.json({
      success: true,
      data: {
        comments: filteredComments,
        total,
        fetchedPages: pages,
        sinceId: sinceId || undefined,
      },
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
