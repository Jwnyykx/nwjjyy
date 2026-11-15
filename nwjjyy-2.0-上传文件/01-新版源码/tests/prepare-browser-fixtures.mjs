import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { zipSync } from 'fflate'

// Explicitly synthetic fixture assets for the browser test; separate from production.
const cover = await readFile(new URL('../src/assets/story-cover.webp', import.meta.url))
const target = new URL('../output/qa-media/', import.meta.url)
await mkdir(target, { recursive: true })
for (let index = 1; index < 4; index++) await writeFile(new URL('test-' + index + '.webp', target), cover)

const count = 4000
const wave = Buffer.alloc(44 + count * 2)
wave.write('RIFF')
wave.writeUInt32LE(wave.length - 8, 4)
wave.write('WAVEfmt ', 8)
wave.writeUInt32LE(16, 16)
wave.writeUInt16LE(1, 20)
wave.writeUInt16LE(1, 22)
wave.writeUInt32LE(8000, 24)
wave.writeUInt32LE(16000, 28)
wave.writeUInt16LE(2, 32)
wave.writeUInt16LE(16, 34)
wave.write('data', 36)
wave.writeUInt32LE(count * 2, 40)
await writeFile(new URL('silent-test.wav', target), wave)
await writeFile(new URL('invalid-test.zip', target), zipSync({ 'test.txt': new Uint8Array([1, 2, 3]) }))
