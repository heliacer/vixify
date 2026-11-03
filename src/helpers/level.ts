import { Resvg } from '@resvg/resvg-js'
import config from '../config.js'

const cost = (level: number) => 100 + 50 * level

export function levelFromXp(xp: number) {
  let level = 0
  while (xp >= cost(level)) xp -= cost(level++)
  return { level, xp, next: cost(level) }
}

const color = `#${config.color.toString(16)}`
const hex = 'M80 16L135.43 48L135.43 112L80 144L24.57 112L24.57 48Z'
const perimeter = 6 * 64

export function levelBadge(xp: number) {
  const { level, xp: into, next } = levelFromXp(xp)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" fill="none" stroke="${color}" stroke-width="6"
      stroke-linejoin="round" font-family="Roboto, DejaVu Sans, Arial, sans-serif" text-anchor="middle">
      <path d="${hex}" stroke-opacity=".22"/>
      <path d="${hex}" stroke-linecap="round" stroke-dasharray="${(into / next) * perimeter} ${perimeter}"/>
      <g fill="${color}" stroke="none">
        <text x="80" y="64" font-size="15" letter-spacing="2">${config.rank.short}</text>
        <text x="80" y="106" font-size="40" font-weight="bold">${level}</text>
      </g>
    </svg>`
  return new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng()
}
