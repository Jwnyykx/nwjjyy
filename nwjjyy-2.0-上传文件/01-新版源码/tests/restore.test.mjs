import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { zipSync } from 'fflate'
import { fixtureDb, asUser, daily, admin, writer, bucket } from './fixture-db.mjs'
import { restoreContent } from '../scripts/restore.mjs'

test('complete JSON plus ZIP can restore records, media and member access into a second database', async () => {
  const newAdmin = '10000000-0000-4000-8000-000000000011'
  const newWriter = '10000000-0000-4000-8000-000000000012'
  const story = '20000000-0000-4000-8000-000000000001'
  const media = '30000000-0000-4000-8000-000000000001'
  const original = new Uint8Array([1, 2, 8, 5])
  const preview = new Uint8Array([2, 1])
  const prefix = admin + '/' + media
  const folder = await mkdtemp(join(tmpdir(), 'nwjjyy-test-'))
  const filename = 'nwjjyy-media-20261114-091400-1.zip'
  await writeFile(join(folder, filename), zipSync({ ['media/' + prefix + '/original']: original, ['media/' + prefix + '/preview']: preview }))
  const old = await fixtureDb()
  const next = await fixtureDb('memory://', { seed: false, users: [newAdmin, newWriter] })
  try {
    await old.query("insert into public.stories(id,author_id,title,event_date,category_id,body,status,published_at) values ($1,$2,'恢复测试','2026-01-10',$3,'测试内容','published','2026-01-10T12:00Z')", [story, admin, daily])
    await old.query("insert into public.media(id,created_by,story_id,media_type,content_type,file_size,preview_size,event_date,caption) values ($1,$2,$3,'image','image/jpeg',4,2,'2026-01-10','照片说明')", [media, admin, story])
    for (const [part, bytes] of [['original', original], ['preview', preview]]) {
      await old.query('insert into storage.objects(bucket_id,name,payload) values ($1,$2,$3)', [bucket, prefix + '/' + part, bytes])
    }
    await old.query("update public.media set state='ready' where id=$1", [media])
    await old.query('update public.stories set cover_media_id=$1 where id=$2', [media, story])
    await old.query('insert into public.perspectives (story_id,author_id,body) values ($1,$2,$3)', [story, writer, '测试视角'])
    const records = {}
    for (const table of ['members','categories','stories','diaries','media','perspectives','promises','anniversaries','storybook_settings']) {
      records[table] = (await old.query('select to_jsonb(t) as row from public.' + table + ' t')).rows.map(item => item.row)
    }
    const backup = { format: 'nwjjyy-storybook', version: 1, scope: 'complete', records, files: [{ filename, uuids: [media] }] }
    const args = {
      db: next, backup, folder, mapping: { [admin]: newAdmin, [writer]: newWriter },
      put: ({ path, bytes, mime }) => next.query(
        'insert into storage.objects(bucket_id,name,payload,content_type) values ($1,$2,$3,$4)', [bucket, path, bytes, mime],
      ),
    }
    await assert.rejects(restoreContent({ ...args, backup: { ...backup, files: [] } }), /缺少/)
    assert.equal((await next.query('select id from public.members')).rows.length, 0)
    await restoreContent(args)
    const result = await asUser(next, newWriter, tx => tx.query('select author_id,body,cover_media_id,revision,published_at::text from public.stories'))
    assert.deepEqual(result.rows[0], { author_id: newAdmin, body: '测试内容', cover_media_id: media, revision: 2,
      published_at: '2026-01-10 12:00:00+00' })
    const restored = await asUser(next, newWriter, tx => tx.query('select payload from storage.objects where name=$1', [newAdmin + '/' + media + '/original']))
    assert.deepEqual(restored.rows[0].payload, original)
    assert.equal((await asUser(next, newWriter, tx => tx.query('select author_id from public.perspectives'))).rows[0].author_id, newWriter)
    assert.deepEqual((await asUser(next, writer, tx => tx.query('select id from public.stories'))).rows, [])
    await assert.rejects(restoreContent(args), /已有内容/)
  } finally {
    await old.close()
    await next.close()
    await rm(folder, { recursive: true })
  }
})

test('V2 backup restores chapters, photo notes, trips, NFC settings and revision author mapping', async () => {
  const newAdmin = randomUUID()
  const newWriter = randomUUID()
  const story = randomUUID()
  const photo = randomUUID()
  const collection = randomUUID()
  const trip = randomUUID()
  const folder = await mkdtemp(join(tmpdir(), 'nwjjyy-v2-restore-'))
  const filename = 'nwjjyy-media-20261115-091400-1.zip'
  const files = { original: new Uint8Array([1, 2, 8, 5]), preview: new Uint8Array([2, 1]) }
  const prefix = admin + '/' + photo
  await writeFile(join(folder, filename), zipSync(Object.fromEntries(
    Object.entries(files).map(([part, bytes]) => ['media/' + prefix + '/' + part, bytes]),
  )))

  const old = await fixtureDb()
  const next = await fixtureDb('memory://', { seed: false, users: [newAdmin, newWriter] })
  try {
    await asUser(old, writer, tx => tx.query(
      "insert into public.stories(id,title,event_date,category_id,body) values ($1,'恢复测试','2025-02-01',$2,'初稿')", [story, daily],
    ))
    await asUser(old, admin, async tx => {
      await tx.query("update public.stories set status='published',body='发布正文' where id=$1", [story])
      await tx.query(
        "insert into public.media(id,story_id,media_type,content_type,file_size,preview_size,event_date) values ($1,$2,'image','image/jpeg',4,2,'2025-02-01')",
        [photo, story],
      )
      for (const [part, bytes] of Object.entries(files)) {
        await tx.query('insert into storage.objects(bucket_id,name,payload) values ($1,$2,$3)', [bucket, prefix + '/' + part, bytes])
      }
      await tx.query("update public.media set state='ready' where id=$1", [photo])
      await tx.query("insert into public.photo_notes(media_id,memory) values ($1,'照片背面')", [photo])
      await tx.query("select public.save_collection($1,$2,$3::uuid[])", [
        collection, JSON.stringify({ title: '恢复合集', description: '', cover_id: photo }), [photo],
      ])
      await tx.query("select public.save_trip($1,$2,$3::uuid[])", [
        trip, JSON.stringify({ title: '恢复相见', city: '成都', note: '', arrival: '2025-02-01' }), [story],
      ])
      const created = await tx.query("insert into public.chapters(title,cover_story_id) values ('恢复章节',$1) returning id", [story])
      await tx.query("insert into public.chapter_entries(chapter_id,story_id) values ($1,$2)", [created.rows[0].id, story])
      await tx.query("insert into public.annual_books(year,title,cover_id,focus_story_id) values (2025,'恢复年鉴',$1,$2)", [photo, story])
      await tx.query("update public.storybook_settings set nfc_story_id=$1,next_meeting='2090-01-02' where id=1", [story])
    })

    const tables = ['members', 'categories', 'stories', 'diaries', 'media', 'perspectives', 'promises', 'anniversaries',
      'storybook_settings', 'chapters', 'chapter_entries', 'photo_notes', 'footprints', 'story_relations',
      'photo_collections', 'photo_collection_items', 'trip_entries', 'annual_books', 'story_revisions']
    const records = {}
    for (const table of tables) {
      records[table] = (await old.query('select to_jsonb(t) as row from public.' + table + ' t')).rows.map(item => item.row)
    }
    await restoreContent({
      db: next, backup: { format: 'nwjjyy-storybook', version: 2, scope: 'complete', records, files: [{ filename, uuids: [photo] }] },
      folder, mapping: { [admin]: newAdmin, [writer]: newWriter },
      put: ({ path, bytes, mime }) => next.query(
        'insert into storage.objects(bucket_id,name,payload,content_type) values ($1,$2,$3,$4)', [bucket, path, bytes, mime],
      ),
    })
    await asUser(next, newWriter, async tx => {
      assert.deepEqual((await tx.query('select editor_id from public.story_revisions order by revision')).rows.map(r => r.editor_id),
        [newWriter, newAdmin])
      assert.equal((await tx.query('select memory from public.photo_notes where media_id=$1', [photo])).rows[0].memory, '照片背面')
      assert.equal((await tx.query('select id from public.collection_photos($1)', [collection])).rows[0].id, photo)
      assert.equal((await tx.query('select story_id from public.trip_entries where footprint_id=$1', [trip])).rows[0].story_id, story)
      assert.equal((await tx.query('select story_id from public.chapter_entries')).rows[0].story_id, story)
      assert.equal((await tx.query('select cover_id from public.annual_books')).rows[0].cover_id, photo)
      assert.deepEqual((await tx.query('select nfc_story_id,next_meeting::text from public.storybook_settings')).rows[0],
        { nfc_story_id: story, next_meeting: '2090-01-02' })
    })
  } finally {
    await old.close()
    await next.close()
    await rm(folder, { recursive: true })
  }
})
