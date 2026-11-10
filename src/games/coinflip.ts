import { randomInt } from 'node:crypto'
import { card } from '../helpers/card.js'
import { verdict } from '../helpers/session.js'
import type { Game } from './index.js'

export const coinflip: Game = {
  emoji: '🪙',
  label: 'Coinflip',
  blurb: '1v1 - fastest way to go broke',
  play(session) {
    const players = [session.hostId, session.guestId!]
    const heads = randomInt(2)
    const [winner, loser] = heads ? players : players.reverse()
    const reason = `${heads ? 'heads' : 'tails'}. <@${loser}> pays up`

    return card(`-# 🪙 coinflip\n${verdict(session, reason, winner)}`)
  }
}
