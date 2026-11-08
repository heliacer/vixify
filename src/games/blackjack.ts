import { randomInt } from 'node:crypto'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { card } from '../helpers/card.js'
import { balance, formatCoins, take } from '../helpers/economy.js'
import type { Session } from '../helpers/session.js'
import { save, settle } from '../helpers/session.js'
import type { Game } from './index.js'

type Hand = { player: string[]; house: string[]; bet: number }

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const deck = ranks.flatMap(rank =>
  ['♠', '♥', '♦', '♣'].map(suit => rank + suit)
)

function deal(count: number, used: string[] = []) {
  const left = deck.filter(card => !used.includes(card))
  return Array.from(
    { length: count },
    () => left.splice(randomInt(left.length), 1)[0]
  )
}

function total(cards: string[]) {
  let sum = 0
  let aces = 0
  for (const card of cards) {
    const rank = card.slice(0, -1)
    if (rank === 'A') aces++
    sum += rank === 'A' ? 11 : 'JQK'.includes(rank) ? 10 : Number(rank)
  }
  while (sum > 21 && aces--) sum -= 10
  return sum
}

const natural = (cards: string[]) => cards.length === 2 && total(cards) === 21

const show = (cards: string[]) =>
  `${cards.map(card => `\`${card}\``).join(' ')} = ${total(cards)}`

function view(
  { id, hostId, guildId, stake }: Session,
  { player, house }: Hand
) {
  const button = (input: string, label: string, style: ButtonStyle) =>
    new ButtonBuilder()
      .setCustomId(`gamble:act:${id}:${input}`)
      .setLabel(label)
      .setStyle(style)

  return card(
    `-# 🃏 blackjack\n## \`${formatCoins(stake)}\` on the table\n` +
      `house \`${house[0]}\` \`??\`\nyou ${show(player)}`,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button('hit', 'Hit', ButtonStyle.Primary),
      button('stand', 'Stand', ButtonStyle.Secondary),
      button('double', 'Double', ButtonStyle.Success).setDisabled(
        player.length > 2 || balance(hostId, guildId) < stake
      )
    )
  )
}

function finish({ id, hostId }: Session, { player, house, bet }: Hand) {
  const you = total(player)
  if (you <= 21 && !natural(player))
    while (total(house) < 17) house.push(...deal(1, [...player, ...house]))
  const dealer = total(house)

  const [title, pay] = natural(player)
    ? natural(house)
      ? ['push', bet]
      : ['blackjack', Math.floor(bet * 2.5)]
    : you > 21
      ? ['bust', 0]
      : dealer > 21 || you > dealer
        ? ['win', bet * 2]
        : you === dealer
          ? ['push', bet]
          : ['house wins', 0]
  settle(id, { [hostId]: pay })

  const result =
    title === 'push'
      ? `\`${formatCoins(bet)}\` went back to <@${hostId}>`
      : pay
        ? `<@${hostId}> takes \`${formatCoins(pay)}\``
        : `\`${formatCoins(bet)}\` went to the house`

  return card(
    `-# 🃏 blackjack\n## ${title}\n${result}\n` +
      `house ${show(house)}\nyou ${show(player)}`
  )
}

export const blackjack: Game = {
  emoji: '🃏',
  label: 'Blackjack',
  blurb: 'you vs the house - pays 3:2',
  solo: true,
  play(session) {
    const player = deal(2)
    const hand = { player, house: deal(2, player), bet: session.stake }
    if (natural(player) || natural(hand.house)) return finish(session, hand)
    save(session.id, hand)
    return view(session, hand)
  },
  act(session, input) {
    const hand = session.state as Hand
    const { player, house } = hand
    if (input === 'stand') return finish(session, hand)

    const doubled = input === 'double'
    if (
      doubled &&
      (player.length > 2 ||
        !take(session.hostId, session.guildId, session.stake))
    )
      return view(session, hand)

    const next = {
      player: [...player, ...deal(1, [...player, ...house])],
      house,
      bet: doubled ? hand.bet * 2 : hand.bet
    }
    if (doubled || total(next.player) >= 21) return finish(session, next)
    save(session.id, next)
    return view(session, next)
  },
  timeout: session => finish(session, session.state as Hand)
}
