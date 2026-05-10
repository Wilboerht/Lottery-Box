/**
 * 评论解析器
 * 支持多种小红书评论粘贴格式
 * 注意：本模块不做去重，去重由调用方根据配置控制
 */

export function parseComments(text) {
  if (!text || !text.trim()) return []

  const rawLines = text.split(/\r?\n/)
  const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return []

  const users = []

  // 策略1：检测标准小红书格式（用户名 + 评论内容 + 点赞数）
  // 特征：多组连续3行，其中第3行是纯数字
  let isStandardFormat = false
  if (lines.length >= 3) {
    let standardCount = 0
    const possibleGroups = Math.floor(lines.length / 3)
    for (let i = 2; i < lines.length; i += 3) {
      if (/^\d+$/.test(lines[i])) {
        standardCount++
      }
    }
    // 至少1组且超过 50% 的第三行是纯数字
    if (standardCount >= Math.max(1, Math.ceil(possibleGroups * 0.5))) {
      isStandardFormat = true
    }
  }

  if (isStandardFormat) {
    let i = 0
    while (i + 2 < lines.length) {
      if (/^\d+$/.test(lines[i + 2])) {
        const name = extractUsername(lines[i])
        if (name) {
          users.push({
            name,
            raw: lines[i],
            content: lines[i + 1] || '',
            likes: lines[i + 2] || '0',
          })
        }
        i += 3
      } else {
        // 当前位置不符合3行一组，降级把这行当普通用户名处理
        const name = extractUsername(lines[i])
        if (name) {
          users.push({ name, raw: lines[i], content: '', likes: '0' })
        }
        i += 1
      }
    }
    // 处理末尾剩余行
    while (i < lines.length) {
      const name = extractUsername(lines[i])
      if (name) {
        users.push({ name, raw: lines[i], content: '', likes: '0' })
      }
      i += 1
    }
    if (users.length > 0) return users
  }

  // 策略2：检测 @用户名 格式（一行一个 @用户）
  const atMatches = lines.filter(l => l.startsWith('@'))
  if (atMatches.length > 0 && atMatches.length >= lines.length * 0.5) {
    for (const line of lines) {
      if (line.startsWith('@')) {
        const name = line.slice(1).trim()
        if (name) {
          users.push({ name, raw: line, content: '', likes: '0' })
        }
      }
    }
    if (users.length > 0) return users
  }

  // 策略3：每行作为一个用户名（简单列表）
  // 过滤掉纯数字行（避免点赞数被当作用户名）
  for (const line of lines) {
    if (/^\d+$/.test(line)) continue // 跳过纯数字
    const name = extractUsername(line)
    if (name) {
      users.push({ name, raw: line, content: '', likes: '0' })
    }
  }

  return users
}

function extractUsername(raw) {
  if (!raw) return ''
  let name = raw.trim()
  if (name.startsWith('@')) name = name.slice(1).trim()
  // 去掉常见后缀（仅当整个后缀匹配时，避免误截断昵称）
  name = name.replace(/\s+(回复|作者|置顶)$/u, '')
  // 长度限制
  const MAX_NAME_LEN = 50
  if (name.length > MAX_NAME_LEN) name = name.slice(0, MAX_NAME_LEN)
  return name
}
