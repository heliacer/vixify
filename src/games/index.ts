import type { card } from '../helpers/card.js'
import type { Session } from '../helpers/session.js'
import { coinflip } from './coinflip.js'

export type Game = {
  emoji: string
  label: string
  blurb: string
  play(session: Session, guestId: string): ReturnType<typeof card>
}

export const games: Record<string, Game> = { coinflip }
