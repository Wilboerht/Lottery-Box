/**
 * 简单的 Canvas 彩带动效
 * 支持 rAF 管理、后台暂停、高 DPI
 */

let activeRafId = null

export function launchConfetti(canvas, duration = 3000) {
  // 取消上一帧动画，防止叠加
  if (activeRafId) {
    cancelAnimationFrame(activeRafId)
    activeRafId = null
  }

  const dpr = window.devicePixelRatio || 1
  let rect = canvas.getBoundingClientRect()

  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const colors = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1d4ed8', '#dbeafe', '#2563eb']
  const particles = []
  const particleCount = 150

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height - rect.height,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 3 + 2,
      speedX: Math.random() * 2 - 1,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 4 - 2,
      opacity: 1,
      dead: false,
    })
  }

  let startTime = null
  let isHidden = false

  function onVisibilityChange() {
    isHidden = document.hidden
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  function onResize() {
    const newRect = canvas.getBoundingClientRect()
    if (newRect.width !== rect.width || newRect.height !== rect.height) {
      rect = newRect
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
    }
  }
  window.addEventListener('resize', onResize)

  function animate(timestamp) {
    if (!startTime) startTime = timestamp
    const elapsed = timestamp - startTime

    ctx.clearRect(0, 0, rect.width, rect.height)

    if (!isHidden) {
      for (const p of particles) {
        if (p.dead) continue

        p.y += p.speedY
        p.x += p.speedX + Math.sin(p.y * 0.01) * 0.5
        p.rotation += p.rotationSpeed

        if (elapsed > duration - 1000) {
          p.opacity = Math.max(0, p.opacity - 0.02)
          if (p.opacity <= 0) p.dead = true
        }

        if (p.y > rect.height + 20) p.dead = true

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      }
    }

    if (elapsed < duration) {
      activeRafId = requestAnimationFrame(animate)
    } else {
      cleanup()
    }
  }

  function cleanup() {
    ctx.clearRect(0, 0, rect.width, rect.height)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('resize', onResize)
    activeRafId = null
  }

  activeRafId = requestAnimationFrame(animate)
}
