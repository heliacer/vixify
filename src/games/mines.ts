import { randomInt } from 'node:crypto'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { card } from '../helpers/card.js'
import { formatCoins } from '../helpers/economy.js'
import type { Session } from '../helpers/session.js'
import { save, settle } from '../helpers/session.js'
import type { Game } from './index.js'

type Board = { mines: number[]; opened: number[] }

const width = 5
const tiles = 20
const mineCount = 7
const payouts = [0, 0.25, 1, 2, 4, 10, 20, 40, 80, 160, 320, 640, 1280, 2560]

function grid(id: number, { mines, opened }: Board, over = false) {
  const tile = (index: number) => {
    const mine = over && mines.includes(index)
    const safe = opened.includes(index)
    return new ButtonBuilder()
      .setCustomId(`gamble:act:${id}:${index}`)
      .setLabel(mine ? '💣' : safe ? '💎' : '?')
      .setStyle(
        mine
          ? ButtonStyle.Danger
          : safe
            ? ButtonStyle.Success
            : ButtonStyle.Secondary
      )
      .setDisabled(over || safe)
  }

  return Array.from({ length: tiles / width }, (_, row) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      Array.from({ length: width }, (_, column) => tile(row * width + column))
    )
  )
}

function view({ id, stake }: Session, board: Board) {
  const safe = board.opened.length
  const payout = Math.floor(stake * payouts[safe])

  return card(
    `-# 💣 mines\n## \`${formatCoins(stake)}\` on the table\n` +
      `-# ${safe} safe - next tile pays ${payouts[safe + 1]}×`,
    ...grid(id, board),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`gamble:act:${id}:cash`)
        .setLabel(`Cash out - ${formatCoins(payout)}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!safe)
    )
  )
}

function cashOut({ id, hostId, stake }: Session, board: Board) {
  const rate = payouts[board.opened.length]
  const payout = Math.floor(stake * rate)
  settle(id, { [hostId]: payout })

  return card(
    `-# 💣 mines\n## <@${hostId}> takes \`${formatCoins(payout)}\`\n` +
      `-# cashed out at ${rate}×`,
    ...grid(id, board, true)
  )
}

export const mines: Game = {
  emoji: '💣',
  label: 'Mines',
  blurb: 'keep digging or cash out',
  solo: true,
  play(session) {
    const placed = new Set<number>()
    while (placed.size < mineCount) placed.add(randomInt(tiles))
    const board = { mines: [...placed], opened: [] }
    save(session.id, board)
    return view(session, board)
  },
  act(session, input) {
    const board = session.state as Board
    if (input === 'cash') return cashOut(session, board)

    const tile = Number(input)
    if (board.mines.includes(tile)) {
      settle(session.id, {})
      return card(
        `-# 💣 mines\n## boom\n\`${formatCoins(session.stake)}\` went to the house`,
        ...grid(session.id, board, true)
      )
    }

    const opened = [...new Set(board.opened).add(tile)]
    const next = { ...board, opened }
    if (opened.length === tiles - mineCount) return cashOut(session, next)
    save(session.id, next)
    return view(session, next)
  },
  timeout: session => cashOut(session, session.state as Board)
}
