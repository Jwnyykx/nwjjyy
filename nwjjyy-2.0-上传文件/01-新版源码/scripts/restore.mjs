// Intended for a dedicated fresh Supabase project or the local restore test.
import { createHash } from 'node:crypto'
import { open, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import { Client } from 'pg'

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const bucket = 'storybook-private'
const columns = Object.freeze({
  members: 'id display_name role active created_at',
  categories: 'id name archived',
  stories: 'id author_id title event_date category_id summary body location weather status is_pinned is_hidden cover_media_id created_at updated_at published_at deleted_at revision',
  diaries: 'id author_id event_date body mood show_on_home status created_at updated_at published_at deleted_at revision',
  perspectives: 'story_id author_id body created_at updated_at',
  media: 'id created_by story_id diary_id category_id event_date media_type content_type file_size preview_size caption sort_order state created_at updated_at deleted_at',
  promises: 'id author_id title description target_date completed_on story_id created_at updated_at deleted_at',
  anniversaries: 'id title event_date show_on_home show_countdown created_at updated_at',
  storybook_settings: 'id home_intro time_zone cover_media_id updated_at',
  chapters: 'id title description sort_order cover_story_id created_at updated_at',
  chapter_entries: 'chapter_id story_id sort_order',
  photo_notes: 'media_id place photographer memory message',
  footprints: 'id author_id city title note arrival departure story_id',
  story_relations: 'story_id related_story_id created_at',
  photo_collections: 'id title description cover_id created_at',
  photo_collection_items: 'collection_id media_id sort_order',
  trip_entries: 'footprint_id story_id',
  annual_books: 'year title reflection cover_id focus_story_id updated_at',
  story_revisions: 'story_id revision editor_id saved_at snapshot',
})
const addedTables = ['chapters', 'chapter_entries', 'photo_notes', 'footprints', 'story_relations',
  'photo_collections', 'photo_collection_items', 'trip_entries', 'annual_books', 'story_revisions']
const contentTables = ['members', 'stories', 'diaries', 'perspectives', 'media', 'promises', 'anniversaries', ...addedTables]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function mappings(backup, mapping) {
  assert(backup?.format === 'nwjjyy-storybook' && [1, 2].includes(backup.version) && backup.scope === 'complete',
    '请选择管理员导出的完整备份 JSON。')
  for (const name of Object.keys(columns)) {
    if (backup.version === 1 && addedTables.includes(name) && backup.records?.[name] === undefined) continue
    assert(Array.isArray(backup.records?.[name]), '备份缺少记录表 ' + name)
  }
  assert(backup.records.storybook_settings.length === 1, '备份缺少唯一的故事书设置。')
  const old = backup.records.members
  assert(old.length >= 1 && old.length <= 2 && old.filter(item => item.role === 'admin').length === 1,
    '备份中的成员数据无效。')
  const next = new Map()
  for (const row of old) {
    const target = mapping?.[row.id]
    assert(uuid.test(row.id) && typeof target === 'string' && uuid.test(target),
      '需要为备份中的每位成员提供新的账号 UID。')
    assert(![...next.values()].includes(target.toLowerCase()), '两位成员必须对应不同的账号。')
    next.set(row.id, target.toLowerCase())
  }
  return next
}

async function inspectArchives(backup, folder) {
  const media = new Map()
  for (const item of backup.records.media) {
    assert(uuid.test(item.id) && item.storage_prefix === item.created_by + '/' + item.id && item.state === 'ready',
      '备份中有无效媒体路径。')
    assert(Number.isInteger(item.file_size) && item.file_size > 0 && item.file_size <= 15728640,
      '备份媒体大小超出限制。')
    assert(item.media_type === 'audio' || item.media_type === 'image', '备份媒体类型无效。')
    assert(!media.has(item.id), '备份中有重复媒体。')
    media.set(item.id, item)
  }
  assert(Array.isArray(backup.files), '备份缺少媒体目录。')
  const covered = new Set()
  const filenames = new Set()
  const batches = []
  for (const batch of backup.files) {
    assert(typeof batch.filename === 'string' && /^nwjjyy-media-[0-9-]+\.zip$/.test(batch.filename) && !filenames.has(batch.filename),
      '请使用备份清单中的媒体 ZIP 文件名。')
    filenames.add(batch.filename)
    assert(Array.isArray(batch.uuids) && batch.uuids.length > 0, '媒体清单无效。')
    const expected = new Map()
    for (const id of batch.uuids) {
      const item = media.get(id)
      assert(item && !covered.has(id), '媒体清单引用缺失或重复。')
      covered.add(id)
      expected.set('media/' + item.storage_prefix + '/original', { item, part: 'original', size: item.file_size })
      if (item.media_type === 'image') {
        assert(Number.isInteger(item.preview_size) && item.preview_size > 0 && item.preview_size <= 1048576, '缩略图大小无效。')
        expected.set('media/' + item.storage_prefix + '/preview', { item, part: 'preview', size: item.preview_size })
      }
    }
    const path = join(folder, batch.filename)
    assert([...expected.values()].reduce((total, item) => total + item.size, 0) <= 40 * 1024 * 1024,
      '媒体备份批次超过解压上限。')
    await archiveContents(path, expected)
    batches.push({ path, expected })
  }
  assert(covered.size === media.size, '备份缺少一个或多个媒体 ZIP。')
  return batches
}

async function archiveContents(path, expected) {
  const handle = await open(path, 'r')
  let buffer
  try {
    const details = await handle.stat()
    assert(details.size <= 45 * 1024 * 1024, '媒体 ZIP 超过批次大小，请重新导出。')
    buffer = await handle.readFile()
  } finally { await handle.close() }
  const entries = unzipSync(buffer, { filter: entry => expected.has(entry.name) && entry.originalSize === expected.get(entry.name).size })
  assert(Object.keys(entries).length === expected.size, 'ZIP 内的文件与备份清单不一致。')
  for (const [name, value] of expected) {
    assert(Object.hasOwn(entries, name) && entries[name].byteLength === value.size, 'ZIP 文件不完整。')
  }
  return entries
}

function memberReferences(table, row, ids) {
  const values = { ...row }
  if (table === 'members') values.id = ids.get(row.id)
  if (Object.hasOwn(row, 'author_id')) values.author_id = ids.get(row.author_id)
  if (Object.hasOwn(row, 'created_by')) values.created_by = ids.get(row.created_by)
  if (row.editor_id) {
    values.editor_id = ids.get(row.editor_id)
    assert(values.editor_id, '备份中的编辑者没有账号映射。')
  }
  if (Object.hasOwn(row, 'author_id')) assert(values.author_id, '备份中的作者没有账号映射。')
  if (Object.hasOwn(row, 'created_by')) assert(values.created_by, '备份中的上传者没有账号映射。')
  return values
}

async function insert(db, table, row, conflict = '') {
  const fields = columns[table].split(' ')
  const placeholders = fields.map((_, index) => '$' + (index + 1)).join(',')
  await db.query('insert into public.' + table + ' (' + fields.join(',') + ') values (' + placeholders + ')' + conflict,
    fields.map(field => field === 'snapshot' ? JSON.stringify(row[field]) : row[field] ?? null))
}

async function prepareTarget(db, ids) {
  for (const table of contentTables) {
    const check = await db.query('select exists(select 1 from public.' + table + ') as occupied')
    assert(!check.rows[0].occupied, '目标数据库已有内容。请使用新迁移且没有成员和记录的专用项目。')
  }
  const settings = await db.query('select id from public.storybook_settings where id=1')
  assert(settings.rows.length === 1, '请先运行项目的数据库迁移。')
  const configured = await db.query('select public from storage.buckets where id=$1', [bucket])
  assert(configured.rows.length === 1 && configured.rows[0].public === false, '目标项目必须存在私有媒体桶。')
  for (const id of ids.values()) {
    assert((await db.query('select 1 from auth.users where id=$1', [id])).rows.length === 1,
      '请先在目标项目创建所有对应的 Auth 账号。')
  }
}

export async function restoreContent({ db, backup, mapping, folder, put }) {
  const ids = mappings(backup, mapping)
  const batches = await inspectArchives(backup, folder)
  await prepareTarget(db, ids)
  const source = Object.assign(Object.fromEntries(addedTables.map(table => [table, []])), backup.records)
  for (const batch of batches) {
    const entries = await archiveContents(batch.path, batch.expected)
    for (const [name, { item, part }] of batch.expected) {
      await put({
        path: ids.get(item.created_by) + '/' + item.id + '/' + part,
        bytes: entries[name],
        mime: part === 'preview' ? 'image/jpeg' : item.content_type,
      })
    }
  }

  // The cloud project is dedicated to one book and has no members yet.
  await db.query('begin')
  try {
    await db.query('lock table public.members in share row exclusive mode')
    await prepareTarget(db, ids)
    for (const row of source.members) await insert(db, 'members', memberReferences('members', row, ids))
    for (const row of source.categories) {
      await insert(db, 'categories', row, ' on conflict (id) do update set name=excluded.name, archived=excluded.archived')
    }
    for (const row of source.stories) {
      await insert(db, 'stories', { ...memberReferences('stories', row, ids), cover_media_id: null, is_hidden: row.is_hidden ?? false })
    }
    for (const table of ['diaries', 'media', 'perspectives', 'promises', 'anniversaries', ...addedTables]) {
      for (const row of source[table]) {
        await insert(db, table, memberReferences(table, table === 'perspectives'
          ? { ...row, created_at: row.created_at ?? row.updated_at } : row, ids))
      }
    }
    // Only this new project's trusted database owner can run this import.
    // Preserve edit timestamps and revisions while linking restored covers, including covers in the bin.
    await db.query('alter table public.stories disable trigger stories_check')
    await db.query('alter table public.stories disable trigger stories_touch')
    for (const row of source.stories) {
      if (row.cover_media_id) {
        const media = source.media.find(item => item.id === row.cover_media_id)
        if (media?.story_id === row.id && media.media_type === 'image') {
          await db.query('update public.stories set cover_media_id=$1 where id=$2', [media.id, row.id])
        }
      }
    }
    await db.query('alter table public.stories enable trigger stories_check')
    await db.query('alter table public.stories enable trigger stories_touch')
    const settings = source.storybook_settings[0]
    const cover = source.media.find(item => item.id === settings.cover_media_id)
    await db.query('alter table public.storybook_settings disable trigger settings_touch')
    await db.query(`update public.storybook_settings set home_intro=$1,time_zone=$2,cover_media_id=$3,
      updated_at=$4,nfc_story_id=$5,home_subtitle=coalesce($6,home_subtitle),appearance=coalesce($7,appearance),
      show_bunny=coalesce($8,show_bunny),allow_motion=coalesce($9,allow_motion),enable_shuffle=coalesce($10,enable_shuffle),
      show_post_notices=coalesce($11,show_post_notices),next_meeting=$12 where id=1`,
      [settings.home_intro, settings.time_zone,
        cover && !cover.story_id && !cover.diary_id && !cover.deleted_at ? cover.id : null, settings.updated_at,
        settings.nfc_story_id ?? null, settings.home_subtitle ?? null, settings.appearance ?? null,
        settings.show_bunny ?? null, settings.allow_motion ?? null, settings.enable_shuffle ?? null,
        settings.show_post_notices ?? null, settings.next_meeting ?? null])
    await db.query('alter table public.storybook_settings enable trigger settings_touch')
    await db.query('commit')
    return Object.fromEntries(Object.keys(columns).map(table => [table, source[table].length]))
  } catch (error) {
    await db.query('rollback')
    throw error
  }
}

function storageWriter(origin, key) {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  return async ({ path, bytes, mime }) => {
    const route = '/storage/v1/object/' + bucket + '/' + path
    const headers = { apikey: key }
    const result = await fetch(origin + route, {
      method: 'POST', headers: { ...headers, 'Content-Type': mime, 'Cache-Control': 'max-age=0', 'x-upsert': 'false' },
      body: bytes, signal: AbortSignal.timeout(90000),
    })
    if (result.ok) return
    const text = await result.text()
    const duplicate = result.status === 409 || (result.status === 400 && /already exists|duplicate/i.test(text))
    if (duplicate) {
      const existing = await fetch(origin + route, { headers, signal: AbortSignal.timeout(90000) })
      if (existing.ok && digest(Buffer.from(await existing.arrayBuffer())) === digest(bytes)) return
    }
    throw new Error('目标 Storage 上传失败（HTTP ' + result.status + '）。检查项目、额度和密钥后重试。')
  }
}

async function main() {
  const manifest = process.argv[2]
  const uidMap = process.argv[3]
  assert(manifest && uidMap && process.argv[4] === '--confirm-new-project',
    '用法：node scripts/restore.mjs <管理员导出的JSON> <成员UID对应表JSON> --confirm-new-project')
  const origin = URL.parse(process.env.STORY_RESTORE_URL ?? '')
  const secret = process.env.STORY_RESTORE_SECRET ?? ''
  const connectionString = process.env.STORY_RESTORE_DATABASE_URL ?? ''
  assert(origin?.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(origin.hostname)
    && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash,
    '请通过 STORY_RESTORE_URL 提供目标项目的标准 HTTPS 地址。')
  assert(/^sb_secret_[A-Za-z0-9_-]+$/.test(secret), '请在当前终端的 STORY_RESTORE_SECRET 中提供目标项目的 secret key。')
  const databaseUrl = URL.parse(connectionString)
  assert(databaseUrl && ['postgresql:', 'postgres:'].includes(databaseUrl.protocol)
    && databaseUrl.hostname === 'db.' + origin.hostname && decodeURIComponent(databaseUrl.username) === 'postgres',
    '请提供同一目标项目 postgres 用户的 Direct connection，避免恢复到错误项目。')
  for (const field of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) databaseUrl.searchParams.delete(field)
  const certificate = process.env.STORY_RESTORE_DATABASE_CA_FILE
  const ca = certificate ? await readFile(certificate, 'utf8') : undefined
  const db = new Client({ connectionString: databaseUrl.href,
    ssl: { rejectUnauthorized: true, ca }, connectionTimeoutMillis: 15000, statement_timeout: 90000 })
  try {
    const backup = JSON.parse(await readFile(manifest, 'utf8'))
    const mapping = JSON.parse(await readFile(uidMap, 'utf8'))
    await db.connect()
    const restored = await restoreContent({ db, backup, mapping, folder: dirname(resolve(manifest)),
      put: storageWriter(origin.origin, secret) })
    console.log('恢复完成。记录数', restored)
  } finally { await db.end() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    let message = String(error.message)
    for (const value of [process.env.STORY_RESTORE_DATABASE_URL, process.env.STORY_RESTORE_SECRET]) {
      if (value) message = message.replaceAll(value, '[已隐藏]')
    }
    console.error('恢复未完成。' + message)
    process.exitCode = 1
  })
}
