import { Resvg } from '@resvg/resvg-js'
import config from '../config.js'

// XP needed to climb from `level` to the next one
const cost = (level: number) => 100 + 50 * level

export function levelFromXp(xp: number) {
  let level = 0
  while (xp >= cost(level)) xp -= cost(level++)
  return { level, progress: xp / cost(level) }
}

// Ring badge for embed thumbnails, transparent so it sits on any theme
const color = `#${config.color.toString(16)}`
const r = 54
const circumference = 2 * Math.PI * r

export function levelBadge(xp: number) {
  const { level, progress } = levelFromXp(xp)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" fill="none" stroke="${color}" stroke-width="5"
      font-family="Roboto, DejaVu Sans, Arial, sans-serif" text-anchor="middle">
      <circle cx="80" cy="80" r="${r}" stroke-opacity=".25"/>
      <circle cx="80" cy="80" r="${r}" stroke-linecap="round" transform="rotate(-90 80 80)"
        stroke-dasharray="${progress * circumference} ${circumference}"/>
      <g fill="${color}" stroke="none">
        <text x="80" y="66" font-size="20">Lvl</text>
        <text x="80" y="106" font-size="40" font-weight="bold">${level}</text>
      </g>
    </svg>`
  return new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng()
}
