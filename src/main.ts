import { ActivityType, IntentsBitField } from 'discord.js'
import { Client } from 'discordx'
import config from './config.js'
import './commands/coins.js'
import './events/activity.js'

const bot = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent
  ],
  simpleCommand: { prefix: '?' }
})

bot.once('clientReady', async () => {
  // Synchronize application commands with Discord
  await bot.initApplicationCommands()

  const presence = config.customPresence
  bot.user?.setPresence({
    activities: [
      {
        name: presence[Math.floor(Math.random() * presence.length)],
        type: ActivityType.Custom
      }
    ]
  })

  console.log('Bot started')
})

bot.on('interactionCreate', interaction => {
  void bot.executeInteraction(interaction)
})

bot.on('messageCreate', message => {
  void bot.executeCommand(message)
})

await bot.login(process.env.BOT_TOKEN!)
