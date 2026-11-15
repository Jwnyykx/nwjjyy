import { test } from 'node:test'
import assert from 'node:assert/strict'
import { admin, asUser, bucket, daily, fixtureDb, guest, writer } from './fixture-db.mjs'

test('chapter directory counts only published entries and keeps chapter and story ordering', async () => {
  const db = await fixtureDb()
  try {
    const { a, b, earlier, later, draft, photo } = await asUser(db, admin, async tx => {
      async function chapter(title, order) {
        const { rows } = await tx.query(
          'insert into public.chapters (title, sort_order) values ($1, $2) returning id', [title, order],
        )
        return rows[0].id
      }
      async function story(title, day, published) {
        const { rows } = await tx.query(
          'insert into public.stories (title, event_date, category_id, body) values ($1, $2, $3, $4) returning id',
          [title, day, daily, '测试章内容'],
        )
        const id = rows[0].id
        if (published) await tx.query("update public.stories set status = 'published' where id = $1", [id])
        return id
      }
      const a = await chapter('第二篇章', 20)
      const b = await chapter('第一篇章', 10)
      const earlier = await story('早发生', '2026-01-10', true)
      const later = await story('晚发生', '2026-02-10', true)
      const draft = await story('读者不该看到的草稿', '2026-01-08', false)
      await tx.query(
        'insert into public.chapter_entries (chapter_id, story_id, sort_order) values ($1, $2, 20), ($1, $3, 10), ($1, $4, 0)',
        [a, earlier, later, draft],
      )
      const media = await tx.query("insert into public.media (story_id, media_type, content_type, file_size, preview_size, event_date) values ($1, 'image', 'image/jpeg', 20, 12, '2026-02-10') returning id", [later])
      const photo = media.rows[0].id
      for (const name of ['original', 'preview']) {
        await tx.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, admin + '/' + photo + '/' + name])
      }
      await tx.query("update public.media set state = 'ready' where id = $1", [photo])
      await tx.query('update public.stories set cover_media_id = $1 where id = $2', [photo, later])
      await tx.query('update public.chapters set cover_story_id = $1 where id = $2', [later, a])
      return { a, b, earlier, later, draft, photo }
    })

    await assert.rejects(asUser(db, null, tx => tx.query('select * from public.chapters')), { code: '42501' })
    assert.deepEqual((await asUser(db, guest, tx => tx.query('select * from public.chapter_directory()'))).rows, [])
    assert.deepEqual((await asUser(db, guest, tx => tx.query('select * from public.chapter_stories($1, 0, 12)', [a]))).rows, [])
    await assert.rejects(asUser(db, writer, tx => tx.query("insert into public.chapters(title) values ('越权写入')")), { code: '42501' })
    const changed = await asUser(db, writer, tx => tx.query('update public.chapter_entries set sort_order = 8 where story_id = $1 returning story_id', [earlier]))
    assert.deepEqual(changed.rows, [])
    assert.deepEqual((await asUser(db, writer, tx => tx.query('select story_id from public.chapter_entries where story_id = $1', [draft]))).rows, [])
    await assert.rejects(asUser(db, admin, tx => tx.query('insert into public.chapter_entries(chapter_id, story_id) values ($1, $2)', [b, later])), { code: '23505' })

    const directory = await asUser(db, writer, tx => tx.query('select id, story_count, cover_media_id from public.chapter_directory()'))
    assert.deepEqual(directory.rows, [
      { id: b, story_count: 0, cover_media_id: null },
      { id: a, story_count: 2, cover_media_id: photo },
    ])
    const page = await asUser(db, writer, tx => tx.query('select id from public.chapter_stories($1, 0, 12)', [a]))
    assert.deepEqual(page.rows, [{ id: later }, { id: earlier }])
    const secondPage = await asUser(db, writer, tx => tx.query('select id from public.chapter_stories($1, 1, 1)', [a]))
    assert.deepEqual(secondPage.rows, [{ id: earlier }])

    await asUser(db, admin, tx => tx.query('update public.stories set deleted_at = now() where id = $1', [later]))
    const filtered = await asUser(db, writer, tx => tx.query('select story_count, cover_media_id from public.chapter_directory() where id = $1', [a]))
    assert.deepEqual(filtered.rows, [{ story_count: 1, cover_media_id: null }])
    await asUser(db, admin, tx => tx.query('delete from public.chapters where id = $1', [a]))
    assert.deepEqual((await asUser(db, admin, tx => tx.query('select id from public.stories where id = $1', [earlier]))).rows, [{ id: earlier }])
  } finally {
    await db.close()
  }
})
