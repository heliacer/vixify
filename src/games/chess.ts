import { randomInt } from 'node:crypto'
import { Chess } from 'chess.js'
import type { Message } from 'discord.js'
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  SeparatorBuilder
} from 'discord.js'
import type { ArgsOf } from 'discordx'
import { Discord, On } from 'discordx'
import { eq } from 'drizzle-orm'
import config from '../config.js'
import { db } from '../db/index.js'
import { sessions } from '../db/schema.js'
import { boardPng } from '../helpers/board.js'
import { card, editMessage } from '../helpers/card.js'
import { formatCoins } from '../helpers/economy.js'
import type { Session } from '../helpers/session.js'
import { save, settle } from '../helpers/session.js'
import type { Game } from './index.js'

type Match = {
  moves: string[]
  white: string
  black: string
  drawOffer?: string
}

const moveTime = 300_000

const norm = (text: string) =>
  text
    .toLowerCase()
    .replace(/[-=+#!?x ]/g, '')
    .replace(/0/g, 'o')

function find(game: Chess, text: string) {
  const hits = game
    .moves({ verbose: true })
    .filter(move => [move.san, move.lan].some(s => norm(s) === norm(text)))
  return (
    hits.find(move => move.san === text) ??
    (hits.length === 1 ? hits[0] : undefined)
  )
}

const parseMove = (game: Chess, text: string) =>
  find(game, text) ?? find(game, text + 'q')

const looksLikeMove =
  /^([kqrbn]?[a-h]?[1-8]?x?[a-h][1-8](=?[qrbn])?[+#!?]*|[o0]-?[o0](-?[o0])?)$/i

function replay(moves: string[]) {
  const game = new Chess()
  for (const move of moves) game.move(move)
  return game
}

const toMove = (game: Chess, { white, black }: Match) =>
  game.turn() === 'w' ? white : black

const opponent = ({ white, black }: Match, userId: string) =>
  userId === white ? black : white

const drawReason = (game: Chess) =>
  game.isStalemate()
    ? 'stalemate'
    : game.isInsufficientMaterial()
      ? 'not enough pieces left to mate'
      : game.isThreefoldRepetition()
        ? 'same position three times'
        : '50 moves without a capture or pawn move'

function withBoard(
  game: Chess,
  flip: boolean,
  top: string,
  ...rest: Parameters<typeof card>
) {
  return {
    ...card(
      top,
      new MediaGalleryBuilder().addItems(item =>
        item.setURL('attachment://board.png')
      ),
      ...rest
    ),
    files: [new AttachmentBuilder(boardPng(game, flip), { name: 'board.png' })],
    attachments: []
  }
}

function live(id: number, match: Match, game: Chess, deadline: number) {
  const mover = toMove(game, match)
  const last = game.history().at(-1)
  const offer = match.drawOffer
    ? `\n-# <@${match.drawOffer}> offers a draw`
    : ''
  const button = (input: string, label: string, style: ButtonStyle) =>
    new ButtonBuilder()
      .setCustomId(`gamble:act:${id}:${input}`)
      .setLabel(label)
      .setStyle(style)

  return {
    ...withBoard(
      game,
      game.turn() === 'b',
      `**${game.turn() === 'w' ? '⚪' : '⚫'} <@${mover}> to move** ` +
        `(${game.moveNumber()})${game.inCheck() ? ' - check' : ''}`,
      `-# ${last ? `last move ${last} - ` : ''}forfeit <t:${Math.floor(deadline / 1000)}:R>${offer}`,
      new SeparatorBuilder(),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(
          'draw',
          match.drawOffer ? '🤝 Accept draw' : '🤝 Offer draw',
          ButtonStyle.Secondary
        ),
        button('resign', '🏳️ Resign', ButtonStyle.Danger)
      )
    ),
    allowedMentions: { parse: [], users: [mover], repliedUser: false }
  }
}

function finish(
  { id, stake }: Session,
  match: Match,
  game: Chess,
  reason: string,
  winner?: string
) {
  const pot = stake * 2
  const cut = Math.floor((pot * config.houseCut) / 100)
  settle(
    id,
    winner
      ? { [winner]: pot - cut }
      : { [match.white]: stake, [match.black]: stake }
  )

  const text = winner
    ? `## <@${winner}> takes \`${formatCoins(pot - cut)}\`\n${reason}\n` +
      `-# the house kept ${formatCoins(cut)}`
    : `## draw\n${reason}. \`${formatCoins(stake)}\` went back to each`
  return () => withBoard(game, false, `-# ♟️ chess\n${text}`)
}

async function open(
  { id }: Session,
  match: Match,
  message: Message,
  deadline: number
) {
  const [white, black] = await Promise.all(
    [match.white, match.black].map(userId => message.client.users.fetch(userId))
  )
  const thread = await message.startThread({
    name: `${white.displayName} vs ${black.displayName}`
  })
  db.update(sessions)
    .set({ threadId: thread.id })
    .where(eq(sessions.id, id))
    .run()
  const board = await thread.send(live(id, match, new Chess(), deadline))
  db.update(sessions)
    .set({ boardId: board.id })
    .where(eq(sessions.id, id))
    .run()
}

export const chess: Game = {
  emoji: '♟️',
  label: 'Chess',
  blurb: '1v1 - winner takes the pot',
  play(session, guestId, message) {
    const { hostId, stake } = session
    const [white, black] = randomInt(2) ? [hostId, guestId] : [guestId, hostId]
    const match = { moves: [], white, black }
    const deadline = Date.now() + moveTime
    save(session.id, match, deadline)
    open(session, match, message!, deadline).catch(console.error)

    return card(
      `-# ♟️ chess\n## \`${formatCoins(stake * 2)}\` pot\n` +
        `⚪ <@${white}> vs ⚫ <@${black}>`
    )
  },
  act(session, input, userId, client) {
    const match = session.state as Match
    const game = replay(match.moves)

    if (input === 'resign' || (match.drawOffer && match.drawOffer !== userId)) {
      const final =
        input === 'resign'
          ? finish(
              session,
              match,
              game,
              `<@${userId}> resigned`,
              opponent(match, userId)
            )
          : finish(session, match, game, 'agreed to a draw')
      editMessage(client, session.channelId, session.messageId, final()).catch(
        console.error
      )
      return final()
    }

    const next = { ...match, drawOffer: userId }
    save(session.id, next, session.deadline)
    return live(session.id, next, game, session.deadline)
  },
  timeout(session, client) {
    const match = session.state as Match
    const game = replay(match.moves)
    const late = toMove(game, match)
    const final =
      game.history().length < 2
        ? finish(session, match, game, `<@${late}> never made a move`)
        : finish(
            session,
            match,
            game,
            `<@${late}> ran out of time`,
            opponent(match, late)
          )
    if (session.threadId && session.boardId)
      editMessage(client, session.threadId, session.boardId, final()).catch(
        console.error
      )
    return final()
  }
}

@Discord()
export class ChessMoves {
  @On()
  async messageCreate([message]: ArgsOf<'messageCreate'>) {
    const { author, channel, client } = message
    if (author.bot || !channel.isThread()) return
    const session = db
      .select()
      .from(sessions)
      .where(eq(sessions.threadId, channel.id))
      .get()
    if (!session?.state) return
    const match = session.state as Match
    const game = replay(match.moves)
    if (author.id !== toMove(game, match)) return

    const text = message.content.trim()
    const move = parseMove(game, text)
    if (!move) {
      if (looksLikeMove.test(text)) await message.react('❌')
      return
    }

    game.move(move.san)
    let view
    if (game.isGameOver()) {
      const final = game.isCheckmate()
        ? finish(session, match, game, 'checkmate', author.id)
        : finish(session, match, game, drawReason(game))
      editMessage(client, session.channelId, session.messageId, final()).catch(
        console.error
      )
      view = final()
    } else {
      const next = { ...match, moves: game.history(), drawOffer: undefined }
      const deadline = Date.now() + moveTime
      save(session.id, next, deadline)
      view = live(session.id, next, game, deadline)
    }

    const board = await channel.send(view)
    if (session.boardId)
      await channel.messages.delete(session.boardId).catch(console.error)
    db.update(sessions)
      .set({ boardId: board.id })
      .where(eq(sessions.id, session.id))
      .run()
  }
}
