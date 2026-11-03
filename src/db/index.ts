import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

const sqlite = new Database('vixify.db')
sqlite.pragma('journal_mode = WAL')

export const db = drizzle({ client: sqlite, casing: 'snake_case' })

migrate(db, { migrationsFolder: 'drizzle' })
