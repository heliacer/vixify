import { randomInt } from 'node:crypto'
import config from '../config.js'
import { card } from '../helpers/card.js'
import { formatCoins } from '../helpers/economy.js'
import { settle } from '../helpers/session.js'
import type { Game } from './index.js'

export const coinflip: Game = {
  emoji: '🪙',
  label: 'Coinflip',
  blurb: '1v1 - fastest way to go broke',
  play({ id, hostId, stake }, guestId) {
    const [side, winner, loser] = randomInt(2)
      ? ['heads', hostId, guestId]
      : ['tails', guestId, hostId]
    const pot = stake * 2
    const cut = Math.floor((pot * config.houseCut) / 100)
    settle(id, { [winner]: pot - cut })

    return card(
      `-# 🪙 coinflip\n## ${side}\n` +
        `<@${winner}> takes \`${formatCoins(pot - cut)}\` from <@${loser}>\n` +
        `-# the house kept ${formatCoins(cut)}`
    )
  }
}
