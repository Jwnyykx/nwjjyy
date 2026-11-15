import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { admin, asUser, bucket, daily, fixtureDb, guest, writer } from './fixture-db.mjs'

test('discovery excludes hidden stories while a member deep link can read them', async () => {
  const db = await fixtureDb()
  const visible = randomUUID()
  const hidden = randomUUID()
  const photo = randomUUID()
  const collection = randomUUID()
  const trip = randomUUID()
  try {
    await asUser(db, admin, async tx => {
      for (const [id, date, title] of [[visible, '2025-02-01', '重逢记录'], [hidden, '2022-02-01', '藏起来的重逢']]) {
        await tx.query('insert into public.stories(id,title,event_date,category_id,body) values ($1,$2,$3,$4,$5)', [id, title, date, daily, '验收正文'])
        await tx.query("update public.stories set status='published', is_hidden=$2 where id=$1", [id, id === hidden])
      }
      await tx.query("insert into public.media(id,story_id,media_type,content_type,file_size,preview_size,event_date) values($1,$2,'image','image/png',16,16,'2025-02-01')", [photo, visible])
      for (const variant of ['original', 'preview']) {
        await tx.query('insert into storage.objects(bucket_id,name) values($1,$2)', [bucket, admin + '/' + photo + '/' + variant])
      }
      await tx.query("update public.media set state='ready' where id=$1", [photo])
      await tx.query("insert into public.photo_notes(media_id,memory,place) values($1,'验收照片背面','测试地点')", [photo])
      await tx.query("select public.save_collection($1,$2,$3::uuid[])", [collection, JSON.stringify({ title: '验收合集', description: '', cover_id: photo }), [photo]])
      await tx.query("select public.save_trip($1,$2,$3::uuid[])", [trip, JSON.stringify({ title: '验收相见', city: '成都', note: '测试记录', arrival: '2025-02-01', departure: '2025-02-02' }), [visible]])
    })
    const search = user => asUser(db, user, tx => tx.query("select item_id from public.search_book('重逢',null,null,null,0)"))
    assert.deepEqual((await search(writer)).rows.map(row => row.item_id), [visible])
    assert.equal((await search(guest)).rows.length, 0)
    await assert.rejects(search(null), { code: '42501' })
    assert.equal((await asUser(db, writer, tx => tx.query('select id from public.stories where id=$1', [hidden]))).rows[0].id, hidden)
    assert.equal((await asUser(db, guest, tx => tx.query('select id from public.stories where id=$1', [hidden]))).rows.length, 0)
    assert.deepEqual((await asUser(db, writer, tx => tx.query('select public.story_years() as year'))).rows, [{ year: 2025 }])
    assert.equal((await asUser(db, writer, tx => tx.query("select item_id from public.search_book('验收照片背面',null,null,null,0)"))).rows[0].item_id, photo)
    assert.equal((await asUser(db, writer, tx => tx.query('select id from public.collection_photos($1)', [collection]))).rows[0].id, photo)
    assert.equal((await asUser(db, writer, tx => tx.query('select story_id from public.trip_entries where footprint_id=$1', [trip]))).rows[0].story_id, visible)
    assert.equal((await asUser(db, writer, tx => tx.query("update public.photo_notes set memory='替别人改' where media_id=$1 returning media_id", [photo]))).rows.length, 0)
    await assert.rejects(asUser(db, writer, tx => tx.query("select public.save_collection($1,'{}'::jsonb,'{}'::uuid[])", [collection])), { code: '42501' })
    await asUser(db, admin, tx => tx.query('update public.stories set is_hidden=true where id=$1', [visible]))
    assert.equal((await asUser(db, writer, tx => tx.query('select id from public.collection_photos($1)', [collection]))).rows.length, 0)
    assert.equal((await asUser(db, writer, tx => tx.query('select id from public.book_photo($1)', [photo]))).rows.length, 0)
  } finally { await db.close() }
})

test('story revisions keep the editor, limit reads and reject stale restores', async () => {
  const db = await fixtureDb()
  const id = randomUUID()
  try {
    await asUser(db, writer, tx => tx.query(
      "insert into public.stories(id,title,event_date,category_id,body) values ($1,'验收初稿','2025-02-01',$2,'第一稿')", [id, daily],
    ))
    await assert.rejects(asUser(db, writer, tx => tx.query('update public.stories set is_hidden=true where id=$1', [id])), { code: '42501' })
    await asUser(db, admin, tx => tx.query("update public.stories set body='第二稿',status='published' where id=$1", [id]))
    const authors = await asUser(db, writer, tx => tx.query('select editor_id from public.story_revisions where story_id=$1 order by revision', [id]))
    assert.deepEqual(authors.rows.map(row => row.editor_id), [writer, admin])
    assert.equal((await asUser(db, guest, tx => tx.query('select story_id from public.story_revisions'))).rows.length, 0)
    await assert.rejects(asUser(db, writer, tx => tx.query('select public.restore_story_text($1,1,1)', [id])), { code: '40001' })
    await asUser(db, writer, tx => tx.query('select public.restore_story_text($1,1,2)', [id]))
    assert.deepEqual((await asUser(db, admin, tx => tx.query('select body,status,revision from public.stories where id=$1', [id]))).rows,
      [{ body: '第一稿', status: 'published', revision: 3 }])
  } finally { await db.close() }
})
