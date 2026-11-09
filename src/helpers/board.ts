import { Resvg } from '@resvg/resvg-js'
import type { Chess } from 'chess.js'
import { pieces } from './pieces.js'

const square = 80
const margin = 40
const size = 8 * square + 2 * margin
const files = 'abcdefgh'
const colors = {
  light: '#efe6f5',
  dark: '#9270b5',
  frame: '#221a2b',
  ink: '#d9c8e8',
  last: '#d55efa',
  check: '#ff3b5c'
}

export function boardPng(chess: Chess, flip: boolean) {
  const last = chess.history({ verbose: true }).at(-1)
  const king = chess.inCheck()
    ? chess.findPiece({ type: 'k', color: chess.turn() })[0]
    : undefined
  const at = (file: number, rank: number) =>
    (flip ? [7 - file, rank] : [file, 7 - rank]).map(n => margin + n * square)

  let body = ''
  for (let rank = 0; rank < 8; rank++)
    for (let file = 0; file < 8; file++) {
      const [x, y] = at(file, rank)
      const name = `${files[file]}${rank + 1}` as Parameters<Chess['get']>[0]
      const piece = chess.get(name)
      const rect = (fill: string, opacity = 1) =>
        `<rect x="${x}" y="${y}" width="${square}" height="${square}" fill="${fill}" fill-opacity="${opacity}"/>`

      body += rect((file + rank) % 2 ? colors.light : colors.dark)
      if (name === last?.from || name === last?.to)
        body += rect(colors.last, 0.5)
      if (name === king)
        body += `<circle cx="${x + square / 2}" cy="${y + square / 2}" r="${square / 2}" fill="url(#check)"/>`
      if (piece)
        body += `<g transform="translate(${x} ${y}) scale(${square / 45})">${pieces[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]}</g>`
    }

  let labels = ''
  for (let i = 0; i < 8; i++) {
    const [x] = at(i, 0)
    const [, y] = at(0, i)
    labels +=
      `<text x="${x + square / 2}" y="${size - 11}">${files[i]}</text>` +
      `<text x="${margin / 2}" y="${y + square / 2 + 9}">${i + 1}</text>`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="check"><stop offset="0" stop-color="${colors.check}"/><stop offset="1" stop-color="${colors.check}" stop-opacity="0"/></radialGradient></defs>
    <rect width="${size}" height="${size}" fill="${colors.frame}"/>${body}
    <g fill="${colors.ink}" font-family="Roboto, DejaVu Sans, Arial, sans-serif" font-size="26" font-weight="bold" text-anchor="middle">${labels}</g>
  </svg>`
  return new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng()
}
