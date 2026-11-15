// Loopback preview adapter. It runs real SQL and RLS against the test database.
// Only the HTTP shape and login identities are simulated. Never expose this server to a network.
import { randomUUID } from 'node:crypto'
import { admin, writer, guest, bucket as mediaBucket, asUser } from './fixture-db.mjs'
import { letterProcedures } from './letters-local.mjs'

const tables = new Set(['members', 'categories', 'stories', 'diaries', 'perspectives', 'media',
  'promises', 'anniversaries', 'storybook_settings', 'chapters', 'chapter_entries', 'photo_notes', 'footprints',
  'story_relations', 'photo_collections', 'photo_collection_items', 'trip_entries', 'annual_books', 'story_revisions'])
const identities = Object.freeze({ 'yangyang@example.test': admin, 'wanwan@example.test': writer, 'visitor@example.test': guest })
const objectResponse = 'application/vnd.pgrst.object+json'
const reserved = new Set(['select', 'order', 'limit', 'offset'])
const credentials = new Map()
const demoPassword = 'story-local-only'
const sqlComparators = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', ilike: 'ilike' }
const dateColumns = new Set(['event_date', 'target_date', 'completed_on', 'arrival', 'departure', 'recorded_on', 'next_meeting'])

function fail(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

async function body(request, bytes = false) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > (bytes ? 15 * 1024 * 1024 : 1024 * 1024)) throw fail(413, 'too_large', '测试文件超过上限。')
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)
  return bytes ? buffer : JSON.parse(buffer.toString('utf8') || '{}')
}

function reply(response, status, result, headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': Buffer.isBuffer(result) ? 'application/octet-stream' : 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(result === undefined ? undefined : Buffer.isBuffer(result) ? result : JSON.stringify(result,
    (key, value) => dateColumns.has(key) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
      ? value.slice(0, 10) : value))
}

function identifier(field) {
  if (typeof field !== 'string' || !/^[a-z][a-z_0-9]*$/.test(field)) {
    throw fail(400, 'invalid_column', '字段无效。')
  }
  return '"' + field + '"'
}

function predicates(search, values) {
  const bind = value => '$' + values.push(value)
  const result = []
  for (const [field, filter] of search) {
    if (reserved.has(field)) continue
    const column = identifier(field)
    const negated = filter.startsWith('not.')
    const condition = negated ? filter.slice(4) : filter
    const dot = condition.indexOf('.')
    const operator = condition.slice(0, dot)
    const value = condition.slice(dot + 1)
    let expression
    if (operator === 'is' && ['null', 'true', 'false'].includes(value)) expression = column + ' is ' + value
    else if (operator === 'in' && /^\([a-f0-9,-]+\)$/i.test(value)) {
      expression = column + ' in (' + value.slice(1, -1).split(',').map(bind).join(',') + ')'
    } else if (Object.hasOwn(sqlComparators, operator)) {
      expression = column + ' ' + sqlComparators[operator] + ' ' + bind(operator === 'ilike' ? value.replaceAll('*', '%') : value)
    } else {
      throw fail(400, 'invalid_filter', '测试接口的筛选条件无效。')
    }
    result.push(negated ? 'not (' + expression + ')' : expression)
  }
  return result.length ? ' where ' + result.join(' and ') : ''
}

function selected(url) {
  const list = url.searchParams.get('select')
  return !list || list === '*' ? '*' : list.split(',').map(identifier).join(',')
}

function orderBy(url) {
  const raw = url.searchParams.get('order')
  if (!raw) return ''
  return ' order by ' + raw.split(',').map(value => {
    const [name, direction, nulls] = value.split('.')
    return identifier(name) + (direction === 'desc' ? ' desc' : ' asc') +
      (nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : '')
  }).join(',')
}

function resultRows(request, response, rows, status = 200, headers = {}) {
  if (request.headers.accept?.includes(objectResponse)) {
    if (rows.length !== 1) throw fail(406, 'PGRST116', '这条记录不存在，或你没有权限。')
    return reply(response, status, rows[0], headers)
  }
  return reply(response, status, rows, headers)
}

async function tablesRoute(db, user, request, response, url, name) {
  if (!tables.has(name)) return reply(response, 404, { message: '找不到这份记录。' })
  const table = 'public.' + identifier(name)
  const projection = selected(url)
  const method = request.method
  const fields = method === 'POST' || method === 'PATCH' ? await body(request) : null
  const values = []
  const filters = predicates(url.searchParams, values)
  if (method === 'GET' || method === 'HEAD') {
    const length = Math.min(1000, Math.max(0, Number(url.searchParams.get('limit') ?? 1000)) || 0)
    const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0)) || 0
    const wantsCount = request.headers.prefer?.includes('count=exact')
    const { rows, count } = await asUser(db, user, async tx => {
      const count = wantsCount
        ? (await tx.query('select count(*)::int as n from ' + table + filters, values)).rows[0].n : '*'
      const data = method === 'HEAD' ? [] : (await tx.query(
        'select ' + projection + ' from ' + table + filters + orderBy(url) +
        ' limit $' + (values.length + 1) + ' offset $' + (values.length + 2),
        [...values, length, offset],
      )).rows
      return { rows: data, count }
    })
    const headers = { 'Content-Range': rows.length ? offset + '-' + (offset + rows.length - 1) + '/' + count : '*/' + count }
    return method === 'HEAD' ? reply(response, 200, undefined, headers) : resultRows(request, response, rows, 200, headers)
  }

  const names = fields === null ? [] : Object.keys(fields)
  const columns = names.map(identifier)
  const bindings = names.map(name => '$' + values.push(fields[name]))
  let statement
  if (method === 'POST' && !filters && names.length) {
    statement = 'insert into ' + table + ' (' + columns.join(',') + ') values (' + bindings.join(',') + ')'
  } else if (method === 'PATCH' && filters && names.length) {
    statement = 'update ' + table + ' set ' + columns.map((name, index) => name + '=' + bindings[index]).join(',') + filters
  } else if (method === 'DELETE' && filters) {
    statement = 'delete from ' + table + filters
  } else {
    throw fail(405, 'invalid_method', '此测试操作不受支持。')
  }
  const representation = request.headers.prefer?.includes('return=representation')
  const result = await asUser(db, user, tx => tx.query(statement + (representation ? ' returning ' + projection : ''), values))
  if (!representation) return reply(response, 204)
  return resultRows(request, response, result.rows, method === 'POST' ? 201 : 200)
}

const procedures = {
  ...letterProcedures,
  chapter_directory: () => ['select * from public.chapter_directory()', [], 'many'],
  chapter_stories: input => ['select * from public.chapter_stories($1,$2,$3)', [input.target, input.start_at, input.limit_to], 'many'],
  save_collection: input => ['select public.save_collection($1,$2,$3::uuid[]) as result',
    [input.target, JSON.stringify(input.fields), input.photos], 'value'],
  collection_photos: input => ['select * from public.collection_photos($1)', [input.target], 'many'],
  book_photo: input => ['select * from public.book_photo($1)', [input.target], 'many'],
  collection_covers: input => ['select * from public.collection_covers($1::uuid[])', [input.targets], 'many'],
  save_trip: input => ['select public.save_trip($1,$2,$3::uuid[]) as result',
    [input.target, JSON.stringify(input.fields), input.linked], 'value'],
  restore_story_text: input => ['select public.restore_story_text($1,$2,$3) as result',
    [input.target, input.previous, input.expected], 'value'],
  search_book: input => ['select * from public.search_book($1,$2,$3,$4,$5)',
    [input.term, input.from_date, input.to_date, input.category_filter, input.start_at], 'many'],
  sound_index: input => ['select * from public.sound_index($1,$2,$3)',
    [input.from_category, input.start_at, input.limit_to], 'many'],
  save_story: input => ['select * from public.save_story($1,$2,$3,$4)', [input.target, input.expected, input.fields, input.items], 'one'],
  save_diary: input => ['select * from public.save_diary($1,$2,$3,$4)', [input.target, input.expected, input.fields, input.items], 'one'],
  save_album: input => ['select public.save_album($1::uuid[],$2)', [input.targets, input.replaced ?? null], 'void'],
  story_years: () => ['select year from public.story_years() year', [], 'scalar'],
  album_years: () => ['select year from public.album_years() year', [], 'scalar'],
  album_photos: input => ['select * from public.album_photos($1,$2,$3,$4,$5,$6)',
    [input.from_date, input.to_date, input.category_filter, input.featured_only, input.start_at, input.limit_to], 'many'],
}

async function procedureRoute(db, user, request, response, name) {
  if (request.method !== 'POST' || !Object.hasOwn(procedures, name)) return reply(response, 404, { message: '测试操作不可用。' })
  const args = await body(request)
  const [statement, values, shape] = procedures[name](args)
  // Force JSON serialization for jsonb parameters (the client sends JS arrays of objects).
  if (name === 'save_story' || name === 'save_diary') {
    values[2] = JSON.stringify(values[2])
    values[3] = JSON.stringify(values[3])
  }
  const { rows } = await asUser(db, user, tx => tx.query(statement, values))
  if (shape === 'void') return reply(response, 204)
  if (shape === 'value') return reply(response, 200, rows[0]?.result ?? null)
  return reply(response, 200, shape === 'one' ? rows[0] : shape === 'scalar' ? rows.map(row => row.year) : rows)
}

function session(email) {
  const identity = identities[email]
  const token = randomUUID()
  const refresh = randomUUID()
  credentials.set(token, { email, refresh })
  return {
    access_token: token, refresh_token: refresh, expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
    user: { id: identity, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} },
  }
}

async function authRoute(request, response, url, token) {
  if (url.pathname === '/auth/v1/logout' && request.method === 'POST') {
    credentials.delete(token)
    return reply(response, 204)
  }
  if (url.pathname !== '/auth/v1/token' || request.method !== 'POST') return reply(response, 404, { message: '本机预览接口。' })
  const input = await body(request)
  if (url.searchParams.get('grant_type') === 'refresh_token') {
    const existing = [...credentials.entries()].find(([, value]) => value.refresh === input.refresh_token)
    if (!existing) throw fail(400, 'refresh_token_not_found', '测试会话已结束，请重新登录。')
    credentials.delete(existing[0])
    return reply(response, 200, session(existing[1].email))
  }
  if (!Object.hasOwn(identities, input.email) || input.password !== demoPassword) {
    throw fail(400, 'invalid_credentials', 'Invalid login credentials')
  }
  return reply(response, 200, session(input.email))
}

async function storageRoute(db, user, request, response, path) {
  const info = path.startsWith('info/')
  const [bucket, ...parts] = (info ? path.slice(5) : path).split('/')
  const name = decodeURIComponent(parts.join('/'))
  if (![mediaBucket, 'storybook-letters'].includes(bucket)) {
    return reply(response, 404, { message: '存储位置不存在。' })
  }
  const target = [bucket, name]
  if (request.method === 'GET') {
    const { rows } = await asUser(db, user, tx => tx.query(
      'select content_type, payload, octet_length(payload) as size from storage.objects where bucket_id=$1 and name=$2', target,
    ))
    const item = rows[0]
    if (!item) return reply(response, 404, { statusCode: '404', message: 'Object not found' })
    if (info) return reply(response, 200, { name, size: item.size, contentType: item.content_type })
    return reply(response, 200, Buffer.from(item.payload), { 'Content-Type': item.content_type })
  }
  if (request.method === 'POST') {
    const payload = await body(request, true)
    const type = request.headers['content-type'] ?? 'application/octet-stream'
    const permitted = ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg']
    if (!permitted.includes(type)) throw fail(400, 'invalid_type', '不支持这个文件类型。')
    await asUser(db, user, tx => tx.query(
      'insert into storage.objects (bucket_id,name,content_type,payload) values ($1,$2,$3,$4)', [...target, type, payload],
    ))
    return reply(response, 200, { Key: bucket + '/' + name })
  }
  if (request.method === 'DELETE' && path === bucket) {
    const input = await body(request)
    const { rows } = await asUser(db, user, tx => tx.query(
      'delete from storage.objects where bucket_id=$1 and name=any($2::text[]) returning name', [bucket, input.prefixes],
    ))
    return reply(response, 200, rows)
  }
  return reply(response, 405, { message: '这项存储操作不可用。' })
}

export function localApi(db, origin) {
  return async (request, response, next) => {
    const url = new URL(request.url, origin)
    const known = ['/auth/v1/', '/rest/v1/', '/storage/v1/object/'].some(prefix => url.pathname.startsWith(prefix))
    if (!known) return next()
    if (request.headers.host !== new URL(origin).host || (request.headers.origin && request.headers.origin !== origin)) {
      return reply(response, 403, { message: '本机预览只允许指定的回环地址。' })
    }
    const token = request.headers.authorization?.replace(/^Bearer /i, '')
    const login = credentials.get(token)
    const user = login ? identities[login.email] : null
    try {
      if (url.pathname.startsWith('/auth/v1/')) return await authRoute(request, response, url, token)
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        return await procedureRoute(db, user, request, response, url.pathname.slice('/rest/v1/rpc/'.length))
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        return await tablesRoute(db, user, request, response, url, url.pathname.slice('/rest/v1/'.length))
      }
      return await storageRoute(db, user, request, response, url.pathname.slice('/storage/v1/object/'.length))
    } catch (error) {
      const code = error.code ?? 'fixture_error'
      const status = error.status ?? (code === '42501' ? (user ? 403 : 401) : code === '23505' ? 409 : 400)
      if (code === 'fixture_error') console.error(error)
      reply(response, status, { code, error_code: code, message: error.message })
    }
  }
}
