import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export const admin = '10000000-0000-4000-8000-000000000001'
export const writer = '10000000-0000-4000-8000-000000000002'
export const guest = '10000000-0000-4000-8000-000000000003'
export const daily = '01000000-0000-4000-8000-000000000001'
export const bucket = 'storybook-private'

const platform = await readFile(new URL('./fixtures/platform.sql', import.meta.url), 'utf8')
const folder = new URL('../supabase/migrations/', import.meta.url)
const migrations = await Promise.all((await readdir(folder)).filter(name => name.endsWith('.sql')).sort().map(async name => ({
  name,
  body: (await readFile(new URL(name, folder), 'utf8')).replace(/^\s*begin\s*;/i, '').replace(/commit\s*;\s*$/i, ''),
})))

export async function fixtureDb(directory = 'memory://', { seed = true, users = [admin, writer, guest] } = {}) {
  const db = await PGlite.create(directory)
  try {
    const existing = await db.query("select to_regclass('public.members') is not null as ready")
    const ready = existing.rows[0].ready
    await db.transaction(async tx => {
      if (!ready) await tx.exec(platform)
      await tx.exec('create table if not exists public.local_storybook_migrations (name text primary key)')
      if (ready) await tx.exec("insert into public.local_storybook_migrations values ('202611140001_storybook.sql') on conflict do nothing")
      for (const migration of migrations) {
        const applied = await tx.query('select name from public.local_storybook_migrations where name = $1', [migration.name])
        if (applied.rows.length) continue
        await tx.exec(migration.body)
        await tx.query('insert into public.local_storybook_migrations values ($1)', [migration.name])
      }
      if (ready) return
      for (const uid of users) {
        await tx.query(
          'insert into auth.users (id) values ($1)',
          [uid],
        )
      }
      if (seed) {
        await tx.query(
          "insert into public.members (id, display_name, role) values ($1, '阳阳（测试）', 'admin'), ($2, '宛宛（测试）', 'writer')",
          [admin, writer],
        )
      }
    })
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}

export function asUser(db, user, callback) {
  return db.transaction(async tx => {
    await tx.exec(user ? 'set local role authenticated' : 'set local role anon')
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? ''])
    return callback(tx)
  })
}
