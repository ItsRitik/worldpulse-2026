'use client'

/**
 * WorldCupHero - animated home banner.
 * Canvas layer: twinkling stars (USA host theme) + slowly drifting, spinning
 * footballs over a mown-pitch gradient. Foreground copy/CTAs are real DOM for
 * crisp text. Honors prefers-reduced-motion (renders a single static frame).
 */

import Link from 'next/link'
import { useEffect, useRef } from 'react'

export function WorldCupHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0

    const resize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const stars = Array.from({ length: 55 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.4,
      phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 1.4,
    }))
    const balls = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random(), y: Math.random(),
      r: 11 + Math.random() * 15,
      vy: -(0.08 + Math.random() * 0.22),
      vx: -0.04 + Math.random() * 0.08,
      rot: Math.random() * Math.PI * 2,
      vr: (-0.012 + Math.random() * 0.024),
      depth: 0.5 + (i % 3) * 0.25,
    }))

    const drawBall = (x: number, y: number, r: number, rot: number, alpha: number) => {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(x, y); ctx.rotate(rot)
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8
      ctx.fill(); ctx.shadowBlur = 0
      const pr = r * 0.34
      ctx.fillStyle = '#0b3d24'
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5
        const px = Math.cos(a) * pr, py = Math.sin(a) * pr
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
      }
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#0b3d24'; ctx.lineWidth = Math.max(1, r * 0.07)
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * pr, Math.sin(a) * pr)
        ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92)
        ctx.stroke()
      }
      ctx.restore()
    }

    let raf = 0, t = 0
    const loop = () => {
      t += 0.016
      ctx.clearRect(0, 0, W, H)
      for (const s of stars) {
        const a = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase))
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      }
      for (const b of balls) {
        if (!reduce) { b.y += b.vy * 0.016 * 60; b.x += b.vx * 0.016 * 60; b.rot += b.vr }
        if (b.y * H < -40) { b.y = 1 + 40 / H; b.x = Math.random() }
        if (b.x < -0.06) b.x = 1.06
        if (b.x > 1.06) b.x = -0.06
        drawBall(b.x * W, b.y * H, b.r, b.rot, 0.55 * b.depth + 0.25)
      }
      if (!reduce) raf = requestAnimationFrame(loop)
    }
    loop()

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div className="relative overflow-hidden rounded-3xl pitch-bg-dark border border-white/10 shadow-lg">
      <div className="pitch-sweep" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(120%_100%_at_50%_-10%,rgba(255,255,255,0.14),transparent_60%)]" />

      <div className="relative px-6 sm:px-10 py-10 sm:py-14 text-center">
        <p className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold text-white/70 uppercase tracking-[0.25em]">
          <span className="text-sm">🇺🇸 🇨🇦 🇲🇽</span>
          <span>Jun 11 - Jul 19, 2026</span>
        </p>

        <h1 className="mt-3 text-4xl sm:text-6xl font-black text-white tracking-tight leading-none drop-shadow">
          WC<span className="text-pulse-200">26</span> Fantasy <span className="text-pulse-300">XI</span>
        </h1>

        <p className="mt-3 text-sm sm:text-base text-white/75 max-w-md mx-auto">
          The FIFA World Cup, your way. Draft your XI, invite your friends, and watch the points roll in live.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/fantasy"
            className="h-11 px-6 flex items-center gap-2 rounded-xl bg-white text-gray-900 text-sm font-bold hover:bg-gray-100 transition-colors shadow">
            Play Fantasy
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
          <Link href="/fixtures"
            className="h-11 px-6 flex items-center rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors border border-white/20 backdrop-blur-sm">
            Browse fixtures
          </Link>
        </div>
      </div>
    </div>
  )
}
