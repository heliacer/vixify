# Vixify

✧ casino, theft, lootboxes. Welcome to late stage discord, choomba.

Economy bot built with [discordx](https://discordx.js.org), [drizzle](https://orm.drizzle.team) and SQLite.

## Development

Requires Node 24+. Create `.env`:

```
BOT_TOKEN=...
```

```bash
npm install
npm run dev
```

-> single file database, `vixify.db`, created on first start.

### Changing the schema

1. Edit `src/db/schema.ts`
2. `npm run db:generate` writes a new SQL migration to `drizzle/`
3. Commit changes, the bot applies pending migrations on startup.

`npm run db:studio` opens a browser UI for the database.

## Raspberry Pi

### 1. Install

```bash
curl -fsSL https://deb.nodesource.com/setup_26.x | sudo bash -
sudo apt install -y nodejs git sqlite3

git clone https://github.com/heliacer/vixify.git ~/vixify
cd ~/vixify
nano .env   # BOT_TOKEN=...
npm ci && npm run build
```

### 2. Run as a service

```bash
mkdir -p ~/.config/systemd/user
ln -s ~/vixify/vixify.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now vixify
sudo loginctl enable-linger $USER
```

logs: `journalctl --user -u vixify -f`

### 3. Auto-update and backups

`crontab -e`:

```
*/5 * * * * bash ~/vixify/deploy.sh >> ~/vixify/deploy.log 2>&1
0 4 * * * mkdir -p ~/backups && sqlite3 ~/vixify/vixify.db ".backup $HOME/backups/vixify-$(date +\%a).db"
```

### 4. Deploy from your PC

`~/.ssh/config` on your PC:

```
Host pi
  HostName pi.local
  User <user>
```

`npm run deploy` after pushing.
