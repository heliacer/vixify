import type { PresenceData } from 'discord.js'
import { ActivityType, IntentsBitField } from 'discord.js'
import { Client } from 'discordx'
import config from './config.js'
import './commands/coins.js'
import './commands/leaderboard.js'
import './commands/steal.js'
import './events/activity.js'

let lastPresence = -1

function nextPresence(): PresenceData {
  const lines = config.customPresence
  let i = Math.floor(Math.random() * lines.length)
  if (lines.length > 1 && i === lastPresence) i = (i + 1) % lines.length
  lastPresence = i
  return { activities: [{ name: lines[i], type: ActivityType.Custom }] }
}

const bot = new Client({
  presence: nextPresence(),
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent
  ],
  simpleCommand: { prefix: '?' }
})

bot.once('clientReady', async () => {
  await bot.initApplicationCommands()
  setInterval(() => bot.user?.setPresence(nextPresence()), 20000)
  console.log('Bot started')
})

bot.on('interactionCreate', interaction => {
  void bot.executeInteraction(interaction)
})

bot.on('messageCreate', message => {
  void bot.executeCommand(message)
})

await bot.login(process.env.BOT_TOKEN!)
