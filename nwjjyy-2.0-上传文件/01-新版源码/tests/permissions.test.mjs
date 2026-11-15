import test from 'node:test'
import assert from 'node:assert/strict'
import { admin, writer, guest, daily, bucket, fixtureDb, asUser } from './fixture-db.mjs'

const first = '20000000-0000-4000-8000-000000000001'
const second = '20000000-0000-4000-8000-000000000002'
const photo = '30000000-0000-4000-8000-000000000001'
const diary = '40000000-0000-4000-8000-000000000001'
const album = '30000000-0000-4000-8000-000000000002'
const unfinished = '30000000-0000-4000-8000-000000000003'
const day = '2026-01-10' // Test fixture date only.
const denied = error => error.code === '42501'
const invalid = error => error.code === '23514'
const files = id => ['original', 'preview'].map(part => admin + '/' + id + '/' + part)

function storyFields(title, status, cover = null, pinned = false) {
  return { title, status, event_date: day, category_id: daily, summary: '测试摘要', body: '测试正文',
    location: '', weather: '', cover_media_id: cover, is_pinned: pinned }
}

function draft(tx, id) {
  return tx.query('insert into public.stories (id, title, event_date, category_id) values ($1, $2, $3, $4) returning *',
    [id, '权限测试草稿', day, daily])
}

async function stage(tx, id, parent = null) {
  await tx.query(
    "insert into public.media (id, story_id, media_type, content_type, file_size, preview_size, event_date) values ($1,$2,'image','image/jpeg',20,12,$3)",
    [id, parent, day],
  )
}

function put(tx, name) {
  return tx.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name])
}

function save(tx, id, revision, fields, media = []) {
  const ordered = media.map((uuid, sort_order) => ({ id: uuid, caption: '测试照片', sort_order }))
  return tx.query('select * from public.save_story($1,$2,$3,$4)',
    [id, revision, JSON.stringify(fields), JSON.stringify(ordered)])
}

test('login alone confers no membership and clients cannot grant themselves rights', async () => {
  const db = await fixtureDb()
  try {
    await asUser(db, admin, tx => draft(tx, first))
    await assert.rejects(asUser(db, null, tx => tx.query('select * from public.stories')), denied)
    assert.deepEqual((await asUser(db, guest, tx => tx.query('select * from public.stories'))).rows, [])
    assert.deepEqual((await asUser(db, guest, tx => tx.query('select * from public.members'))).rows, [])
    for (const user of [writer, guest]) {
      await assert.rejects(asUser(db, user, tx => tx.query("update public.members set role = 'admin' where id = $1", [user])), denied)
      await assert.rejects(asUser(db, user, tx => tx.query(
        "insert into public.members (id, display_name, role) values ($1, '未经授权', 'writer')", [guest],
      )), denied)
    }
    await assert.rejects(asUser(db, guest, tx => draft(tx, second)), denied)
    await assert.rejects(asUser(db, writer, tx => tx.query(
      'insert into public.stories (title, event_date, category_id, author_id) values ($1, $2, $3, $4)',
      ['作者不可代填', day, daily, admin],
    )), denied)
    await assert.rejects(asUser(db, writer, tx => tx.query('delete from public.stories where id = $1', [first])), denied)
    await assert.rejects(asUser(db, null, tx => tx.query('select public.story_years()')), denied)
    await asUser(db, admin, tx => tx.query('update public.members set active = false where id = $1 returning id', [writer]))
    assert.deepEqual((await asUser(db, writer, tx => tx.query('select * from public.members'))).rows, [])
    await asUser(db, admin, tx => tx.query('update public.members set active = true where id = $1 returning id', [writer]))
    assert.equal((await asUser(db, writer, tx => tx.query('select count(*)::int as count from public.members'))).rows[0].count, 2)
  } finally { await db.close() }
})

test('story publication is atomic, private attachments follow publication, and deletion is reversible', async () => {
  const db = await fixtureDb()
  try {
    const [original, preview] = files(photo)
    await asUser(db, admin, async tx => {
      await draft(tx, first)
      await stage(tx, photo, first)
      await put(tx, original)
    })
    await assert.rejects(asUser(db, admin, tx => save(tx, first, 1, storyFields('发布测试', 'published', photo), [photo])), invalid)
    let row = (await asUser(db, admin, tx => tx.query('select status, revision from public.stories where id = $1', [first]))).rows[0]
    assert.deepEqual(row, { status: 'draft', revision: 1 })

    await asUser(db, admin, tx => put(tx, preview))
    for (const user of [null, guest, writer]) {
      assert.equal((await asUser(db, user, tx => tx.query('select name from storage.objects where name = $1', [original]))).rows.length, 0)
    }
    await assert.rejects(asUser(db, guest, tx => put(tx, guest + '/' + photo + '/original')), denied)
    await assert.rejects(asUser(db, writer, tx => stage(tx, album, first)), denied)
    const published = await asUser(db, admin, tx => save(tx, first, 1, storyFields('发布测试', 'published', photo, true), [photo]))
    assert.equal(published.rows[0].revision, 2)
    assert.equal((await asUser(db, writer, tx => tx.query('select id from public.stories where id = $1', [first]))).rows.length, 1)
    assert.equal((await asUser(db, writer, tx => tx.query('select name from storage.objects where name = $1', [original]))).rows.length, 1)
    assert.equal((await asUser(db, guest, tx => tx.query('select name from storage.objects where name = $1', [original]))).rows.length, 0)
    assert.equal((await asUser(db, writer, tx => tx.query(
      "update public.stories set title = '改他人的标题' where id = $1 returning id", [first],
    ))).rows.length, 0)
    assert.equal((await asUser(db, writer, tx => tx.query('delete from storage.objects where name = $1 returning id', [original]))).rows.length, 0)
    assert.equal((await asUser(db, admin, tx => tx.query('delete from storage.objects where name = $1 returning id', [original]))).rows.length, 0)
    assert.equal((await asUser(db, admin, tx => tx.query('update storage.objects set payload = $2 where name = $1 returning id', [original, new Uint8Array([0])]))).rows.length, 0)

    await asUser(db, writer, tx => tx.query('insert into public.perspectives (story_id, body) values ($1, $2)', [first, '另一位作者的测试视角']))
    assert.equal((await asUser(db, admin, tx => tx.query('select author_id from public.perspectives where story_id = $1', [first]))).rows[0].author_id, writer)
    await assert.rejects(asUser(db, admin, tx => save(tx, first, 1, storyFields('旧版本提交', 'published', photo), [photo])), error => error.code === '40001')
    await asUser(db, admin, tx => save(tx, first, 2, storyFields('修改后', 'published', photo, true), [photo]))
    row = (await asUser(db, writer, tx => tx.query('select title from public.stories where id = $1', [first]))).rows[0]
    assert.equal(row.title, '修改后')
    assert.deepEqual((await asUser(db, writer, tx => tx.query('select year from public.album_years() year'))).rows, [{ year: 2026 }])
    assert.equal((await asUser(db, writer, tx => tx.query(
      'select id from public.album_photos($1,$2,$3,true,0,12)', ['2026-01-01', '2026-01-31', daily],
    ))).rows[0].id, photo)
    await asUser(db, admin, tx => tx.query("update public.stories set event_date = '2025-12-30' where id = $1", [first]))
    assert.equal((await asUser(db, writer, tx => tx.query(
      "select event_date::text as date from public.album_photos('2025-01-01','2025-12-31',$1,true,0,12)", [daily],
    ))).rows[0].date, '2025-12-30')

    await asUser(db, admin, tx => tx.query('update public.stories set deleted_at = now() where id = $1', [first]))
    assert.equal((await asUser(db, writer, tx => tx.query('select id from public.stories where id = $1', [first]))).rows.length, 0)
    assert.equal((await asUser(db, writer, tx => tx.query('select name from storage.objects where name = $1', [original]))).rows.length, 0)
    assert.equal((await asUser(db, writer, tx => tx.query('select * from public.perspectives where story_id = $1', [first]))).rows.length, 0)
    await asUser(db, admin, tx => tx.query('update public.stories set deleted_at = null where id = $1', [first]))
    assert.equal((await asUser(db, writer, tx => tx.query('select name from storage.objects where name = $1', [original]))).rows.length, 1)
    const current = (await asUser(db, admin, tx => tx.query('select revision from public.stories where id = $1', [first]))).rows[0].revision
    await asUser(db, admin, tx => save(tx, first, current, storyFields('撤回的故事', 'draft', photo), [photo]))
    assert.equal((await asUser(db, writer, tx => tx.query('select name from storage.objects where name = $1', [original]))).rows.length, 0)
    assert.equal((await asUser(db, writer, tx => tx.query('select * from public.album_photos(null,null,null,false,0,12)'))).rows.length, 0)
  } finally { await db.close() }
})

test('writer can publish own diary and story, admin alone manages site settings and featured records', async () => {
  const db = await fixtureDb()
  try {
    await asUser(db, writer, tx => draft(tx, second))
    await assert.rejects(asUser(db, writer, tx => tx.query(
      'insert into public.promises (title, completed_on, story_id) values ($1, $2, $3)', ['不能关联草稿', day, second],
    )), invalid)
    await assert.rejects(asUser(db, writer, tx => save(tx, second, 1, storyFields('精选限制', 'published', null, true))), denied)
    await asUser(db, writer, tx => save(tx, second, 1, storyFields('共同记录者的测试故事', 'published')))
    await asUser(db, admin, tx => tx.query('update public.stories set is_pinned = true where id = $1', [second]))
    await asUser(db, writer, tx => save(tx, second, 3, storyFields('保留精选标记的修改', 'published', null, true)))
    await asUser(db, writer, tx => tx.query('insert into public.diaries (id, event_date, body) values ($1,$2,$3)', [diary, day, '私有测试日记']))
    assert.equal((await asUser(db, guest, tx => tx.query('select id from public.diaries'))).rows.length, 0)
    await asUser(db, writer, tx => tx.query(
      'select public.save_diary($1,1,$2,$3)', [diary, JSON.stringify({ event_date: day, body: '日记发布测试', mood: '', show_on_home: true, status: 'published' }), '[]'],
    ))
    assert.equal((await asUser(db, admin, tx => tx.query('select status from public.diaries where id = $1', [diary]))).rows[0].status, 'published')
    await assert.rejects(asUser(db, writer, tx => tx.query('insert into public.anniversaries(title,event_date) values ($1,$2)', ['测试纪念日', day])), denied)
    await asUser(db, admin, tx => tx.query('insert into public.anniversaries(title,event_date) values ($1,$2)', ['测试纪念日', day]))
    assert.equal((await asUser(db, writer, tx => tx.query('update public.storybook_settings set time_zone = $1 returning id', ['UTC']))).rows.length, 0)
    await assert.rejects(asUser(db, admin, tx => tx.query('update public.storybook_settings set time_zone = $1', ['Not/A_Zone'])), invalid)
    await asUser(db, admin, tx => tx.query('update public.storybook_settings set time_zone = $1', ['Asia/Shanghai']))
  } finally { await db.close() }
})

test('album saves original and preview, abandoned uploads can be cleaned without deleting published files', async () => {
  const db = await fixtureDb()
  try {
    assert.equal((await db.query('select public from storage.buckets where id = $1', [bucket])).rows[0].public, false)
    await asUser(db, admin, async tx => {
      await stage(tx, album)
      await stage(tx, unfinished)
      for (const name of [...files(album), files(unfinished)[0]]) await put(tx, name)
      await tx.query('select public.save_album(array[$1]::uuid[])', [album])
    })
    assert.equal((await asUser(db, writer, tx => tx.query('select name from storage.objects where bucket_id = $1', [bucket]))).rows.length, 2)
    const name = files(unfinished)[0]
    assert.equal((await asUser(db, writer, tx => tx.query('delete from storage.objects where name = $1 returning id', [name]))).rows.length, 0)
    await asUser(db, admin, async tx => {
      await tx.query('update public.media set deleted_at = now() where id = $1', [unfinished])
      assert.equal((await tx.query('delete from storage.objects where name = $1 returning id', [name])).rows.length, 1)
    })
    assert.equal((await asUser(db, admin, tx => tx.query('select count(*)::int as count from storage.objects'))).rows[0].count, 2)
  } finally { await db.close() }
})
