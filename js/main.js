import { parseComments } from './parser.js'
import { drawWinners, filterCandidates, generateSeed } from './lottery.js'
import { launchConfetti } from '../assets/confetti.js'

// ---------- 工具函数 ----------

function escapeHtml(str) {
  if (typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function safeJsonParse(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 隐私模式/存储满时静默失败
  }
}

/**
 * 格式化日期时间
 */
function formatDateTime(input) {
  try {
    const date = new Date(input)
    if (isNaN(date.getTime())) return String(input)
    const now = new Date()
    const isSameYear = date.getFullYear() === now.getFullYear()
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    if (isSameYear) {
      return `${m}-${d} ${h}:${min}`
    }
    return `${y}-${m}-${d} ${h}:${min}`
  } catch {
    return String(input)
  }
}

function debounce(fn, delay) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

function showToast(message, type = 'info') {
  let toast = document.getElementById('lottery-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'lottery-toast'
    document.body.appendChild(toast)
  }

  const bgMap = {
    info: 'bg-neutral-900 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-amber-500 text-white',
    success: 'bg-green-600 text-white',
  }

  toast.textContent = message
  toast.className = `fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all duration-300 pointer-events-none ${bgMap[type] || bgMap.info}`

  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translate(-50%, 0)'
  })

  clearTimeout(toast._timer)
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translate(-50%, -8px)'
  }, 2500)
}

function copyTextFallback(text) {
  return new Promise((resolve, reject) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(resolve).catch(reject)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.readOnly = true
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      ok ? resolve() : reject(new Error('execCommand failed'))
    } catch (e) {
      document.body.removeChild(textarea)
      reject(e)
    }
  })
}

// ---------- DOM 与状态 ----------

let els = {}
let parsedUsers = []
let isDrawing = false
let dedupEnabled = true
let history = safeJsonParse('lottery_history', [])

// API 模式状态
let apiState = {
  loggedIn: false,
  notes: [],
  selectedNoteId: '',
  isFetching: false,
  fetchedComments: [],
}

const API_BASE = '' // 同域部署，使用相对路径

document.addEventListener('DOMContentLoaded', () => {
  cacheElements()
  bindEvents()
  renderHistory()
  handleInput()
  initApiMode()
  requestAnimationFrame(() => {
    updateTabIndicator()
  })
})

window.addEventListener('resize', () => {
  requestAnimationFrame(updateTabIndicator)
})

function cacheElements() {
  els = {
    // Tab
    tabManual: document.getElementById('tab-manual'),
    tabApi: document.getElementById('tab-api'),
    tabNav: document.getElementById('tab-nav'),
    tabIndicator: document.getElementById('tab-indicator'),
    panelManual: document.getElementById('panel-manual'),
    panelApi: document.getElementById('panel-api'),
    formatHint: document.getElementById('format-hint'),

    // 手动粘贴
    input: document.getElementById('comment-input'),
    parseStatus: document.getElementById('parse-status'),
    clearBtn: document.getElementById('clear-btn'),

    // 配置
    winnerCount: document.getElementById('winner-count'),
    decrementBtn: document.getElementById('decrement-btn'),
    incrementBtn: document.getElementById('increment-btn'),
    dedupToggle: document.getElementById('dedup-toggle'),
    keywordFilter: document.getElementById('keyword-filter'),

    // 抽奖
    startBtn: document.getElementById('start-btn'),
    animation: document.getElementById('lottery-animation'),
    rollingName: document.getElementById('rolling-name'),
    resultModal: document.getElementById('result-modal'),
    resultBackdrop: document.getElementById('result-backdrop'),
    resultContent: document.getElementById('result-content'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    winnerList: document.getElementById('winner-list'),
    copyBtn: document.getElementById('copy-btn'),
    resetBtn: document.getElementById('reset-btn'),
    historyList: document.getElementById('history-list'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    historyToggle: document.getElementById('history-toggle'),
    historyChevron: document.getElementById('history-chevron'),
    historyContent: document.getElementById('history-content'),
    confettiCanvas: document.getElementById('confetti-canvas'),

    // API 模式
    apiLoginSection: document.getElementById('api-login-section'),
    apiContentSection: document.getElementById('api-content-section'),
    apiConnectBtn: document.getElementById('api-connect-btn'),
    apiLogoutBtn: document.getElementById('api-logout-btn'),
    apiNoteSelect: document.getElementById('api-note-select'),
    apiNoteInfo: document.getElementById('api-note-info'),
    apiFetchBtn: document.getElementById('api-fetch-btn'),
    apiIncremental: document.getElementById('api-incremental'),
    apiProgress: document.getElementById('api-progress'),
    apiProgressText: document.getElementById('api-progress-text'),
    apiProgressCount: document.getElementById('api-progress-count'),
    apiProgressBar: document.getElementById('api-progress-bar'),
    apiFetchResult: document.getElementById('api-fetch-result'),
  }
}

function bindEvents() {
  // Tab 切换
  els.tabManual.addEventListener('click', () => switchTab('manual'))
  els.tabApi.addEventListener('click', () => switchTab('api'))

  // 手动粘贴
  els.input.addEventListener('input', debounce(handleInput, 150))
  els.clearBtn.addEventListener('click', () => {
    els.input.value = ''
    handleInput()
  })

  els.decrementBtn.addEventListener('click', () => {
    let v = parseInt(els.winnerCount.value, 10) || 1
    if (v > 1) els.winnerCount.value = v - 1
  })
  els.incrementBtn.addEventListener('click', () => {
    let v = parseInt(els.winnerCount.value, 10) || 1
    if (v < 100) els.winnerCount.value = v + 1
  })

  els.winnerCount.addEventListener('input', () => {
    const val = els.winnerCount.value
    if (val && !/^\d+$/.test(val)) {
      els.winnerCount.value = val.replace(/\D/g, '')
    }
  })
  els.winnerCount.addEventListener('change', validateWinnerCount)

  els.dedupToggle.addEventListener('change', () => {
    dedupEnabled = els.dedupToggle.checked
    handleInput()
  })

  els.keywordFilter.addEventListener('input', debounce(handleInput, 200))

  els.startBtn.addEventListener('click', startLottery)
  els.copyBtn.addEventListener('click', copyWinners)
  els.resetBtn.addEventListener('click', resetLottery)
  els.modalCloseBtn.addEventListener('click', closeResultModal)
  els.resultBackdrop.addEventListener('click', closeResultModal)
  els.clearHistoryBtn.addEventListener('click', () => {
    history = []
    safeLocalStorageSet('lottery_history', history)
    renderHistory()
  })

  els.historyToggle.addEventListener('click', () => {
    const isHidden = els.historyContent.classList.contains('hidden')
    if (isHidden) {
      els.historyContent.classList.remove('hidden')
      els.historyChevron.style.transform = 'rotate(180deg)'
    } else {
      els.historyContent.classList.add('hidden')
      els.historyChevron.style.transform = 'rotate(0deg)'
    }
  })

  // API 模式事件
  els.apiConnectBtn.addEventListener('click', connectXhs)
  els.apiLogoutBtn.addEventListener('click', logoutXhs)
  els.apiNoteSelect.addEventListener('change', onNoteSelect)
  els.apiFetchBtn.addEventListener('click', fetchComments)
}

// ---------- Tab 切换 ----------

function updateTabIndicator() {
  if (!els.tabIndicator || !els.tabNav) return
  const activeTab = els.tabManual.classList.contains('text-brand') ? els.tabManual : els.tabApi
  const navRect = els.tabNav.getBoundingClientRect()
  const tabRect = activeTab.getBoundingClientRect()
  els.tabIndicator.style.width = tabRect.width + 'px'
  els.tabIndicator.style.transform = `translateX(${tabRect.left - navRect.left}px)`
}

function switchTab(mode) {
  const outgoing = mode === 'manual' ? els.panelApi : els.panelManual
  const incoming = mode === 'manual' ? els.panelManual : els.panelApi

  if (mode === 'manual') {
    els.tabManual.classList.add('text-brand')
    els.tabManual.classList.remove('text-neutral-400')
    els.tabApi.classList.remove('text-brand')
    els.tabApi.classList.add('text-neutral-400')
    if (els.formatHint) els.formatHint.classList.remove('hidden')
  } else {
    els.tabApi.classList.add('text-brand')
    els.tabApi.classList.remove('text-neutral-400')
    els.tabManual.classList.remove('text-brand')
    els.tabManual.classList.add('text-neutral-400')
    if (els.formatHint) els.formatHint.classList.add('hidden')
  }
  updateTabIndicator()

  // 旧面板淡出
  outgoing.style.opacity = '0'
  outgoing.style.transform = 'translateY(4px)'
  outgoing.style.transition = 'opacity 0.15s ease, transform 0.15s ease'

  setTimeout(() => {
    outgoing.classList.add('hidden')
    outgoing.style.opacity = ''
    outgoing.style.transform = ''
    outgoing.style.transition = ''

    incoming.classList.remove('hidden')
    incoming.classList.add('tab-panel-animate')
    setTimeout(() => incoming.classList.remove('tab-panel-animate'), 260)
  }, 150)
}

// ---------- 手动粘贴逻辑 ----------

function validateWinnerCount() {
  let v = parseInt(els.winnerCount.value, 10)
  if (isNaN(v) || v < 1) v = 1
  if (v > 100) v = 100
  els.winnerCount.value = v
}

function handleInput() {
  parsedUsers = parseComments(els.input.value)

  let uniqueCount = parsedUsers.length
  if (dedupEnabled) {
    const seen = new Set()
    uniqueCount = parsedUsers.filter(u => {
      if (seen.has(u.name)) return false
      seen.add(u.name)
      return true
    }).length
  }

  const keyword = els.keywordFilter.value.trim()
  let filteredCount = uniqueCount
  if (keyword && parsedUsers.length > 0) {
    const result = filterCandidates(parsedUsers, {
      deduplicate: dedupEnabled,
      keywordFilter: keyword,
    })
    filteredCount = result.filteredCount
  }

  updateParseStatus(parsedUsers.length, uniqueCount, filteredCount)
}

function updateParseStatus(total, unique, filtered) {
  let text = `已识别到 ${total} 条有效评论`
  if (unique !== total) {
    text += `，去重后 ${unique} 条`
  }
  if (filtered !== unique) {
    text += `，符合过滤条件 ${filtered} 条`
  }
  els.parseStatus.textContent = text

  if (total === 0) {
    els.parseStatus.classList.add('text-neutral-400')
    els.parseStatus.classList.remove('text-brand')
  } else {
    els.parseStatus.classList.remove('text-neutral-400')
    els.parseStatus.classList.add('text-brand')
  }
}

// ---------- 抽奖流程 ----------

async function startLottery() {
  if (isDrawing) return

  if (parsedUsers.length === 0) {
    showToast('请先粘贴评论内容或拉取评论', 'warning')
    els.input.focus()
    return
  }

  const count = parseInt(els.winnerCount.value, 10) || 1
  if (count > parsedUsers.length) {
    showToast(`参与用户只有 ${parsedUsers.length} 人，中奖人数不能多于参与人数`, 'warning')
    return
  }

  const keyword = els.keywordFilter.value.trim()
  const options = {
    deduplicate: dedupEnabled,
    keywordFilter: keyword,
  }

  let drawResult
  try {
    drawResult = drawWinners(parsedUsers, count, options)
  } catch (err) {
    console.error('抽奖计算出错:', err)
    showToast('抽奖计算出错，请刷新页面重试', 'error')
    return
  }

  const { winners: preWinners, candidates, filteredCount } = drawResult

  if (filteredCount === 0) {
    showToast('没有符合过滤条件的用户，请调整关键词或去重设置', 'warning')
    return
  }

  if (filteredCount < count) {
    const ok = confirm(
      `符合抽奖条件的用户只有 ${filteredCount} 人，少于设置的中奖人数 ${count}。\n将抽取 ${filteredCount} 位中奖者，是否继续？`
    )
    if (!ok) return
  }

  isDrawing = true
  els.startBtn.disabled = true
  els.startBtn.classList.add('opacity-60', 'cursor-not-allowed')
  closeResultModal()
  els.animation.classList.remove('hidden')

  let rollCount = 0
  const maxRoll = 30 + Math.floor(Math.random() * 10)
  const rollInterval = setInterval(() => {
    try {
      if (rollCount < maxRoll - 3) {
        const randomIdx = Math.floor(Math.random() * candidates.length)
        els.rollingName.textContent = candidates[randomIdx]?.name || '???'
      } else {
        const winnerIdx = (rollCount - (maxRoll - 3)) % preWinners.length
        els.rollingName.textContent = preWinners[winnerIdx]?.name || '???'
      }
      rollCount++

      if (rollCount >= maxRoll) {
        clearInterval(rollInterval)
        finishLottery(preWinners, filteredCount)
      }
    } catch (err) {
      clearInterval(rollInterval)
      console.error('动画出错:', err)
      showToast('抽奖动画出错', 'error')
      resetDrawingState()
    }
  }, 80)
}

function finishLottery(winners, filteredCount) {
  const seed = generateSeed()

  els.animation.classList.add('hidden')
  openResultModal()

  els.winnerList.innerHTML = winners.map((w, i) => `
    <div class="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200 winner-highlight" data-winner-index="${i + 1}">
      <div class="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm shrink-0">
        ${i + 1}
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-neutral-900 truncate text-[15px]" data-winner-name>${escapeHtml(w.name)}</div>
        ${w.content ? `<div class="text-xs text-neutral-500 truncate mt-0.5">${escapeHtml(w.content)}</div>` : ''}
      </div>
    </div>
  `).join('')

  setTimeout(() => {
    launchConfetti(els.confettiCanvas, 2500)
  }, 300)

  const record = {
    id: seed,
    time: new Date().toISOString(),
    total: parsedUsers.length,
    filteredCount,
    winnerCount: winners.length,
    winners: winners.map(w => w.name),
  }
  history.unshift(record)
  if (history.length > 20) history = history.slice(0, 20)
  safeLocalStorageSet('lottery_history', history)
  renderHistory()

  resetDrawingState()
}

function resetDrawingState() {
  isDrawing = false
  els.startBtn.disabled = false
  els.startBtn.classList.remove('opacity-60', 'cursor-not-allowed')
}

function copyWinners() {
  const items = els.winnerList.querySelectorAll('[data-winner-index]')
  const names = Array.from(items).map(el => {
    const idx = el.dataset.winnerIndex
    const nameEl = el.querySelector('[data-winner-name]')
    const name = nameEl ? nameEl.textContent.replace('@', '').trim() : ''
    return `${idx}. ${name}`
  })
  if (names.length === 0) return

  const text = `🎉 中奖名单 🎉\n${names.join('\n')}\n\n—— 由 Lottery-Box 抽奖箱抽取`
  copyTextFallback(text).then(() => {
    showToast('中奖名单已复制到剪贴板', 'success')
  }).catch(() => {
    showToast('复制失败，请手动复制中奖名单', 'error')
  })
}

function openResultModal() {
  els.resultModal.classList.remove('hidden')
  // 重新触发动画
  els.resultBackdrop.classList.remove('modal-backdrop-animate')
  els.resultContent.classList.remove('modal-animate')
  void els.resultBackdrop.offsetWidth // force reflow
  els.resultBackdrop.classList.add('modal-backdrop-animate')
  els.resultContent.classList.add('modal-animate')
  document.body.style.overflow = 'hidden'
}

function closeResultModal() {
  if (els.resultModal) {
    els.resultModal.classList.add('hidden')
    document.body.style.overflow = ''
  }
}

function resetLottery() {
  closeResultModal()
  els.animation.classList.add('hidden')
}

function renderHistory() {
  if (history.length === 0) {
    els.historyList.innerHTML = '<div class="text-center py-3 text-neutral-400 text-xs">暂无抽奖记录</div>'
    return
  }

  els.historyList.innerHTML = history.slice(0, 5).map((h, i) => {
    let timeStr = '未知时间'
    try {
      const date = new Date(h.time)
      if (!isNaN(date.getTime())) {
        timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
    } catch {}

    const totalLabel = h.filteredCount !== undefined && h.filteredCount !== h.total
      ? `${h.total}人参与 / ${h.filteredCount}人符合`
      : `${h.total}人参与`

    return `
      <div class="flex items-center justify-between py-2 ${i > 0 ? 'border-t border-neutral-100' : ''}">
        <div class="text-xs">
          <span class="text-neutral-900">${escapeHtml(timeStr)}</span>
          <span class="text-neutral-400 ml-2">${totalLabel} / ${h.winnerCount}人中奖</span>
        </div>
        <div class="text-xs text-brand font-medium truncate max-w-[120px]">
          ${escapeHtml(h.winners.join('、'))}
        </div>
      </div>
    `
  }).join('')
}

// ==================== API 自动模式 ====================

function initApiMode() {
  // 检测 OAuth 回调参数
  const urlParams = new URLSearchParams(window.location.search)
  const authStatus = urlParams.get('auth')
  if (authStatus === 'success') {
    showToast('小红书授权成功', 'success')
    // 清除 URL 参数
    window.history.replaceState({}, document.title, window.location.pathname)
    switchTab('api')
  } else if (authStatus === 'error') {
    const msg = urlParams.get('message') || '授权失败'
    showToast(decodeURIComponent(msg), 'error')
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  // 检查登录状态
  checkLoginStatus()
}

async function checkLoginStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
    })
    const data = await res.json()
    apiState.loggedIn = data.success && data.loggedIn
    renderApiState()

    if (apiState.loggedIn) {
      loadNotes()
    }
  } catch (err) {
    console.error('检查登录状态失败:', err)
    apiState.loggedIn = false
    renderApiState()
  }
}

function renderApiState() {
  if (apiState.loggedIn) {
    els.apiLoginSection.classList.add('hidden')
    els.apiContentSection.classList.remove('hidden')
  } else {
    els.apiLoginSection.classList.remove('hidden')
    els.apiContentSection.classList.add('hidden')
  }
}

async function connectXhs() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/url`, { credentials: 'include' })
    const data = await res.json()
    if (data.success && data.url) {
      window.location.href = data.url
    } else {
      showToast('获取授权链接失败', 'error')
    }
  } catch (err) {
    console.error('获取授权链接失败:', err)
    showToast('无法连接授权服务，请检查后端是否启动', 'error')
  }
}

async function logoutXhs() {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    apiState.loggedIn = false
    apiState.notes = []
    apiState.selectedNoteId = ''
    apiState.fetchedComments = []
    renderApiState()
    resetApiNoteSelect()
    showToast('已退出登录', 'info')
  } catch (err) {
    console.error('退出登录失败:', err)
    showToast('退出登录失败', 'error')
  }
}

async function loadNotes() {
  try {
    const res = await fetch(`${API_BASE}/api/notes`, { credentials: 'include' })
    const data = await res.json()

    if (!data.success) {
      if (res.status === 401) {
        showToast('登录已过期，请重新授权', 'warning')
        apiState.loggedIn = false
        renderApiState()
        return
      }
      showToast(data.message || '获取笔记列表失败', 'error')
      return
    }

    // 适配小红书 API 返回结构（根据实际文档可能需调整）
    const notes = data.data?.notes || data.data?.list || data.data || []
    apiState.notes = notes
    populateNoteSelect(notes)
  } catch (err) {
    console.error('获取笔记列表失败:', err)
    showToast('获取笔记列表失败，请检查网络', 'error')
  }
}

function populateNoteSelect(notes) {
  els.apiNoteSelect.innerHTML = '<option value="">请选择要抽奖的笔记...</option>'
  notes.forEach(note => {
    const option = document.createElement('option')
    option.value = note.id || note.note_id || ''
    const title = note.title || '无标题'
    option.textContent = title.length > 40 ? title.slice(0, 40) + '...' : title
    els.apiNoteSelect.appendChild(option)
  })
}

function resetApiNoteSelect() {
  els.apiNoteSelect.innerHTML = '<option value="">请选择要抽奖的笔记...</option>'
  els.apiNoteInfo.classList.add('hidden')
  els.apiFetchResult.classList.add('hidden')
}

function onNoteSelect() {
  const noteId = els.apiNoteSelect.value
  apiState.selectedNoteId = noteId

  if (!noteId) {
    els.apiNoteInfo.classList.add('hidden')
    return
  }

  const note = apiState.notes.find(n => (n.id || n.note_id) === noteId)
  if (!note) {
    els.apiNoteInfo.classList.add('hidden')
    return
  }

  const title = escapeHtml(note.title || '无标题')
  const stats = note.statistics || {}
  const likes = stats.like_count || note.likes || note.like_count || '-'
  const comments = stats.comment_count || note.comments || note.comment_count || '-'
  const rawTime = note.publish_time || note.create_time || ''
  const time = rawTime ? formatDateTime(rawTime) : '-'

  els.apiNoteInfo.innerHTML = `
    <div class="text-sm font-medium text-neutral-900 mb-1">${title}</div>
    <div class="flex gap-3 text-xs text-neutral-500">
      <span>❤️ ${likes}</span>
      <span>💬 ${comments}</span>
      <span>🕐 ${time}</span>
    </div>
  `
  els.apiNoteInfo.classList.remove('hidden')
}

async function fetchComments() {
  if (apiState.isFetching) return

  const noteId = apiState.selectedNoteId
  if (!noteId) {
    showToast('请先选择一条笔记', 'warning')
    return
  }

  apiState.isFetching = true
  els.apiFetchBtn.disabled = true
  els.apiFetchBtn.classList.add('opacity-60', 'cursor-not-allowed')
  els.apiProgress.classList.remove('hidden')
  els.apiFetchResult.classList.add('hidden')
  els.apiProgressText.textContent = '正在拉取评论...'
  els.apiProgressCount.textContent = '0 / 0'
  els.apiProgressBar.style.width = '0%'

  try {
    const incremental = els.apiIncremental.checked
    const incrementalKey = `xhs_incremental_${noteId}`
    let sinceId = incremental ? (safeJsonParse(incrementalKey, {}).lastCommentId || '') : ''

    const fetchUrl = new URL(`${API_BASE}/api/comments/${encodeURIComponent(noteId)}/all`, window.location.origin)
    if (sinceId) {
      fetchUrl.searchParams.set('since_id', sinceId)
    }

    const res = await fetch(fetchUrl.toString(), {
      credentials: 'include',
    })
    const data = await res.json()

    if (!data.success) {
      if (res.status === 401) {
        showToast('登录已过期，请重新授权', 'warning')
        apiState.loggedIn = false
        renderApiState()
      } else {
        showToast(data.message || '拉取评论失败', 'error')
      }
      return
    }

    let comments = data.data?.comments || []

    // 增量更新：过滤掉已拉取过的评论
    if (incremental && sinceId) {
      const lastIndex = comments.findIndex(c => (c.id || c.comment_id) === sinceId)
      if (lastIndex >= 0) {
        comments = comments.slice(0, lastIndex)
      }
    }

    apiState.fetchedComments = comments

    // 保存增量标记
    if (comments.length > 0) {
      const firstComment = comments[0]
      safeLocalStorageSet(incrementalKey, {
        lastCommentId: firstComment.id || firstComment.comment_id || '',
        lastFetchTime: new Date().toISOString(),
      })
    }

    // 将评论转换为文本格式并填入输入框
    const commentText = formatCommentsToText(comments)
    els.input.value = commentText
    handleInput()

    // 显示结果
    els.apiProgressText.textContent = '拉取完成'
    els.apiProgressCount.textContent = `${comments.length} 条`
    els.apiProgressBar.style.width = '100%'

    els.apiFetchResult.innerHTML = `
      <span class="text-sm text-brand font-medium">✅ 成功拉取 ${comments.length} 条评论，已填入上方</span>
    `
    els.apiFetchResult.classList.remove('hidden')

    showToast(`成功拉取 ${comments.length} 条评论`, 'success')

    // 2 秒后自动收起进度条
    setTimeout(() => {
      els.apiProgress.classList.add('hidden')
    }, 2000)

  } catch (err) {
    console.error('拉取评论失败:', err)
    showToast('拉取评论失败，请检查网络', 'error')
  } finally {
    apiState.isFetching = false
    els.apiFetchBtn.disabled = false
    els.apiFetchBtn.classList.remove('opacity-60', 'cursor-not-allowed')
  }
}

/**
 * 将 API 返回的评论数组格式化为文本框内容
 * 适配小红书评论数据结构
 */
function formatCommentsToText(comments) {
  if (!Array.isArray(comments) || comments.length === 0) return ''

  return comments.map(c => {
    const nickname = c.user_info?.nickname || c.user?.nickname || c.nickname || c.user_name || '未知用户'
    const content = (c.content || c.text || '').replace(/\r?\n/g, ' ')
    const likes = c.like_count || c.likes || c.praise_count || '0'
    return `${nickname}\n${content}\n${likes}`
  }).join('\n')
}
