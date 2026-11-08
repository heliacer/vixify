import type { card } from '../helpers/card.js'
import type { Session } from '../helpers/session.js'
import { blackjack } from './blackjack.js'
import { coinflip } from './coinflip.js'
import { mines } from './mines.js'

type View = ReturnType<typeof card>

export type Game = {
  emoji: string
  label: string
  blurb: string
  solo?: boolean
  play(session: Session, guestId: string): View
  act?(session: Session, input: string): View
  timeout?(session: Session): View
}

export const games: Record<string, Game> = { blackjack, mines, coinflip }
