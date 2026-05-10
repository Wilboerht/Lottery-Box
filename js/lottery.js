/**
 * 抽奖核心逻辑
 */

/**
 * 密码学安全的随机整数 [0, max)
 * 使用拒绝采样消除 Modulo Bias
 * @param {number} max 上限（不包含）
 * @returns {number}
 */
function secureRandomInt(max) {
  if (max <= 0) return 0
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1)
    // 拒绝采样：只接受 [0, limit) 范围内的值
    const limit = 0x100000000 - (0x100000000 % max)
    let val
    do {
      crypto.getRandomValues(arr)
      val = arr[0]
    } while (val >= limit)
    return val % max
  }
  // Fallback（非安全上下文）
  return Math.floor(Math.random() * max)
}

/**
 * Fisher-Yates 洗牌算法（密码学安全）
 * @param {Array} array 待洗牌数组
 * @returns {Array} 新数组（不修改原数组）
 */
export function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 仅过滤候选用户（不洗牌，不抽取）
 * @param {Array} users 用户列表
 * @param {Object} options 配置选项
 * @returns {Object} { candidates, filteredCount, afterDedup }
 */
export function filterCandidates(users, options = {}) {
  const { deduplicate = true, keywordFilter = '', minLength = 0 } = options

  let candidates = [...users]

  // 去重（按用户名）
  if (deduplicate) {
    const seen = new Set()
    candidates = candidates.filter(u => {
      if (seen.has(u.name)) return false
      seen.add(u.name)
      return true
    })
  }

  const afterDedup = candidates.length

  // 关键词过滤（评论内容）
  if (keywordFilter && keywordFilter.trim()) {
    const kw = keywordFilter.trim().toLowerCase()
    candidates = candidates.filter(u =>
      (u.content || '').toLowerCase().includes(kw)
    )
  }

  // 最小字数过滤
  if (minLength > 0) {
    candidates = candidates.filter(u =>
      (u.content || '').length >= minLength
    )
  }

  const filteredCount = candidates.length

  return { candidates, filteredCount, afterDedup }
}

/**
 * 执行抽奖
 * @param {Array} users 用户列表（已解析）
 * @param {number} count 中奖人数
 * @param {Object} options 配置选项
 * @returns {Object} { winners, candidates, filteredCount, afterDedup }
 */
export function drawWinners(users, count, options = {}) {
  const { candidates, filteredCount, afterDedup } = filterCandidates(users, options)

  // 洗牌并抽取
  const shuffled = shuffle(candidates)
  const winners = shuffled.slice(0, Math.min(count, shuffled.length))

  return { winners, candidates: shuffled, filteredCount, afterDedup }
}

/**
 * 生成唯一抽奖记录 ID
 */
export function generateSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(8)
    crypto.getRandomValues(arr)
    return Date.now().toString(36) + Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
