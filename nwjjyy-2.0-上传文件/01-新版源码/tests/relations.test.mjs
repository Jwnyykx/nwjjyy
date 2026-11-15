import test from 'node:test'
import assert from 'node:assert/strict'
import { admin, writer, guest, daily, fixtureDb, asUser } from './fixture-db.mjs'

const source = '20000000-0000-4000-8000-000000000001'
const target = '20000000-0000-4000-8000-000000000002'
const draft = '20000000-0000-4000-8000-000000000003'

test('story relationships inherit reading rights and only source editors can change them', async () => {
  const db = await fixtureDb()
  const deny = error => error.code === '42501'
  const rows = async user => (await asUser(db, user, tx => tx.query(
    'select story_id, related_story_id from public.story_relations order by story_id, related_story_id'
  ))).rows
  const add = (user, from, to) => asUser(db, user, tx => tx.query(
    'insert into public.story_relations(story_id,related_story_id) values ($1,$2)', [from, to]
  ))
  const remove = async (user, from, to) => (await asUser(db, user, tx => tx.query(
    'delete from public.story_relations where story_id = $1 and related_story_id = $2 returning story_id', [from, to]
  ))).rows
  try {
    await db.query("insert into public.stories(id,author_id,title,event_date,category_id,body,status) values ($1,$4,'初页','2026-01-08',$6,'正文','published'), ($2,$5,'第二页','2026-02-10',$6,'正文','published'), ($3,$4,'草稿','2026-02-11',$6,'正文','draft')", [source,target,draft,admin,writer,daily])
    await add(admin, source, target)
    await add(admin, draft, target)
    await assert.rejects(add(admin, source, draft), deny)
    await assert.rejects(add(writer, source, target), deny)
    await assert.rejects(add(guest, source, target), deny)
    await assert.rejects(rows(null), deny)
    assert.deepEqual(await rows(guest), [])
    assert.deepEqual(await rows(writer), [{ story_id: source, related_story_id: target }])
    assert.deepEqual(await remove(writer, source, target), [])
    await db.query('update public.stories set deleted_at = now() where id = $1', [target])
    assert.deepEqual(await rows(writer), [])
    assert.equal((await remove(admin, source, target)).length, 1)
  } finally {
    await db.close()
  }
})
