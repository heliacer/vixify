import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import type { Client } from 'discord.js'
import { Discord, SimpleCommand, SimpleCommandMessage } from 'discordx'

const run = promisify(execFile)
const pending = '/tmp/vixify-deploy.json'
const onPi = 'INVOCATION_ID' in process.env

async function git(...args: string[]) {
  return (await run('git', args)).stdout.trim()
}

function elapsed(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`
}

export async function reportDeploy(bot: Client) {
  if (!existsSync(pending)) return
  const { channel, message, started } = JSON.parse(
    readFileSync(pending, 'utf8')
  )
  rmSync(pending)
  const target = await bot.channels.fetch(channel)
  if (!target?.isTextBased()) return
  const live = await git('log', '-1', '--format=%h %s')
  await target.messages.edit(
    message,
    `shipped \`${live}\` - ${elapsed(Date.now() - started)}`
  )
}

@Discord()
export class Deploy {
  @SimpleCommand({ name: 'deploy' })
  async text({ message }: SimpleCommandMessage) {
    if (!onPi) return
    const allowedMentions = { repliedUser: false }
    const { owner } = await message.client.application.fetch()
    if (message.author.id !== owner?.id) {
      await message.reply({ content: "you don't work here", allowedMentions })
      return
    }

    const reply = await message.reply({
      content: 'shipping...',
      allowedMentions
    })
    writeFileSync(
      pending,
      JSON.stringify({
        channel: reply.channelId,
        message: reply.id,
        started: Date.now()
      })
    )
    const error = await run('bash', ['deploy.sh']).then(
      () => undefined,
      error => error
    )
    if (error?.signal) return
    rmSync(pending)

    const step = /^failed: (.+)$/m.exec(error?.stdout)?.[1]
    await reply.edit(
      !error
        ? `nothing to ship, \`${await git('rev-parse', '--short', 'HEAD')}\` is live`
        : step
          ? `deploy failed at \`${step}\``
          : 'deploy failed'
    )
  }
}
