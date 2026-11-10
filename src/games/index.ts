import type { Client, Message } from 'discord.js'
import type { card } from '../helpers/card.js'
import type { Session } from '../helpers/session.js'
import { blackjack } from './blackjack.js'
import { chess } from './chess.js'
import { coinflip } from './coinflip.js'
import { mines } from './mines.js'

type View = ReturnType<typeof card>

export type Game = {
  emoji: string
  label: string
  blurb: string
  solo?: boolean
  friendly?: boolean
  play(session: Session, message?: Message): View
  act?(session: Session, input: string, userId: string, client: Client): View
  timeout?(session: Session, client: Client): View
}

export const games: Record<string, Game> = { chess, blackjack, mines, coinflip }
