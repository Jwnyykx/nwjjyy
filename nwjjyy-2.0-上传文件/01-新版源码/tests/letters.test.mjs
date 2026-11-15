import { readFile } from 'node:fs/promises'
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { admin, asUser, fixtureDb, guest, writer } from './fixture-db.mjs'

const migration = await readFile(new URL('../supabase/migrations/202611140002_letters.sql', import.meta.url), 'utf8')
const permissionDenied = { code: '42501' }
const invalid = { code: '22023' }
const conflict = { code: '40001' }

test('letters enforce recipient access, sealed body, server unlock, and immutable delivery', async () => {
  const db = await fixtureDb()
  try {
    const supplied = await db.query("select to_regprocedure('public.letter_status()') is not null as ready")
    if (!supplied.rows[0].ready) await db.exec(migration)
    const call = async (user, name, ...args) => {
      const { rows } = await asUser(db, user, tx => tx.query(
        'select public.' + name + '(' + args.map((_, i) => '$' + (i + 1)).join(',') + ') as result', args,
      ))
      return rows[0]?.result
    }
    const id = randomUUID()
    const title = '一年后再读'
    const body = '信纸上的正文'
    const future = "2999-12-31T23:59"
    const asset = randomUUID()
    const draftInput = [id, writer, title, body, 'plum', future, false, false, false, null]
    const draft = await call(admin, 'letter_save', ...draftInput)
    assert.equal(draft.draft, true)
    assert.equal((await call(admin, 'letter_save', ...draftInput)).revision, draft.revision)
    assert.equal((await call(admin, 'letter_detail', id)).body, body)
    assert.equal(await call(writer, 'letter_detail', id), null)
    assert.deepEqual(await call(writer, 'letter_list', 'inbox', 0), [])
    assert.deepEqual((await call(writer, 'letter_archive')).letters, [])
    await assert.rejects(call(null, 'letter_detail', id), permissionDenied)
    await assert.rejects(call(guest, 'letter_detail', id), permissionDenied)

    // A concurrent draft edit cannot silently overwrite a saved revision.
    const revised = [id, writer, title, body + '，下次接着写。', 'plum', future, false, false, false, draft.revision]
    const edited = await call(admin, 'letter_save', ...revised)
    assert.equal(edited.revision, 2)
    await assert.rejects(call(admin, 'letter_save', ...draftInput), conflict)
    await assert.rejects(call(admin, 'letter_discard', id, draft.revision), conflict)
    await assert.rejects(call(writer, 'letter_save', id, admin, title, body, 'plum', future, false, false, false, 2), permissionDenied)
    await assert.rejects(call(writer, 'letter_stage', id, edited.revision, asset, 'image', 'image/png', 16), conflict)
    await call(admin, 'letter_stage', id, edited.revision, asset, 'image', 'image/png', 16)

    const sentInput = [...revised.slice(0, 8), true, edited.revision, [asset]]
    await assert.rejects(call(admin, 'letter_save', ...sentInput), invalid)
    assert.equal((await call(admin, 'letter_detail', id)).draft, true)
    await asUser(db, admin, tx => tx.query(
      "insert into storage.objects (bucket_id,name) values ('storybook-letters',$1)", [asset],
    ))
    const sent = await call(admin, 'letter_save', ...sentInput)
    assert.equal(sent.draft, false)
    assert.equal((await call(admin, 'letter_save', ...sentInput)).revision, sent.revision)
    assert.equal(sent.unlock_at, '2999-12-31T15:59:00+00:00')
    assert.equal((await call(admin, 'letter_list', 'sent', 0)).length, 1)
    const sealed = await call(writer, 'letter_detail', id)
    assert.equal(sealed.title, null)
    assert.equal(sealed.body, null)
    assert.deepEqual(sealed.attachments, [])
    assert.equal(sealed.locked, true)
    assert.equal((await call(writer, 'letter_archive')).letters[0].body, null)
    assert.deepEqual(await call(writer, 'letter_status'), { unread: 0, unlocked: 0 })
    await assert.rejects(call(writer, 'letter_open', id), permissionDenied)
    const storageCount = async user => Number((await asUser(db, user, tx => tx.query(
      "select count(*) as count from storage.objects where bucket_id = 'storybook-letters' and name = $1", [asset],
    ))).rows[0].count)
    assert.equal(await storageCount(writer), 0)
    assert.equal(await storageCount(guest), 0)
    await assert.rejects(asUser(db, writer, tx => tx.query('select body from private.letter_bodies where letter_id = $1', [id])), permissionDenied)
    await assert.rejects(call(admin, 'letter_discard', id, sent.revision), conflict)
    await assert.rejects(call(admin, 'letter_save', ...revised.slice(0, 3), '偷偷改过的正文', ...sentInput.slice(4)), invalid)

    // Move the test fixture to a date in the past using a trusted database connection.
    await db.query("update private.letter_envelopes set unlock_at = statement_timestamp() - interval '1 second' where id = $1", [id])
    assert.deepEqual(await call(writer, 'letter_status'), { unread: 0, unlocked: 1 })
    const ready = await call(writer, 'letter_detail', id)
    assert.equal(ready.locked, false)
    assert.equal(ready.body, null)
    assert.equal(await storageCount(writer), 0)
    const opened = await call(writer, 'letter_open', id)
    assert.equal(opened.body, revised[3])
    assert.equal(opened.attachments[0].id, asset)
    assert.equal(await storageCount(writer), 1)
    assert.ok(opened.opened_at)
    assert.equal((await call(writer, 'letter_open', id)).opened_at, opened.opened_at)
    assert.equal((await call(admin, 'letter_detail', id)).opened_at, null)
    assert.equal((await call(writer, 'letter_archive')).letters[0].body, revised[3])
    assert.deepEqual(await call(writer, 'letter_status'), { unread: 0, unlocked: 0 })
    await call(writer, 'letter_favorite', id, true)
    assert.equal((await call(writer, 'letter_list', 'favorite', 0))[0].id, id)
    assert.deepEqual(await call(admin, 'letter_list', 'favorite', 0), [])
    await call(writer, 'letter_favorite', id, false)
    assert.deepEqual(await call(writer, 'letter_list', 'favorite', 0), [])

    // Ordinary letters expose the title at delivery, while the read receipt is opt-in.
    const other = randomUUID()
    await call(writer, 'letter_save', other, admin, title, body, 'kraft', null, false, true, true, null)
    assert.deepEqual(await call(admin, 'letter_status'), { unread: 1, unlocked: 0 })
    assert.equal((await call(admin, 'letter_list', 'inbox', 0))[0].title, title)
    await assert.rejects(call(writer, 'letter_open', other), permissionDenied)
    const receipt = await call(admin, 'letter_open', other)
    assert.equal((await call(writer, 'letter_detail', other)).opened_at, receipt.opened_at)
    const deleted = randomUUID()
    await call(writer, 'letter_save', deleted, admin, title, body, 'rose', null, false, false, false, null)
    await call(writer, 'letter_discard', deleted, 1)
    assert.equal(await call(writer, 'letter_detail', deleted), null)
  } finally {
    await db.close()
  }
})
