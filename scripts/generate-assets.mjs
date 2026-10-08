#!/usr/bin/env node
/**
 * Ecosystem Guardian — procedural asset generator.
 *
 * Emits every image declared in src/assets/assetManifest.ts into public/assets/**.
 * Pure Node (ESM), zero third-party dependencies: PNG encoding is hand-rolled on
 * top of node:zlib, drawing helpers are hand-rolled, randomness comes from a
 * fixed-seed mulberry32 PRNG so output is byte-identical across runs.
 *
 * Usage:
 *   node scripts/generate-assets.mjs            # generate all assets
 *   node scripts/generate-assets.mjs --verify   # existence + IHDR sizes + pixel integrity
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

// ---------------------------------------------------------------------------
// paths + constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.dirname(SCRIPT_DIR)
const OUTPUT_ROOT = path.join(PROJECT_ROOT, 'public', 'assets')

/** Fixed master seed — change it and every sprite changes. */
const MASTER_SEED = 0x5ec0a11d

// ---------------------------------------------------------------------------
// deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------

/** FNV-1a style string hash → uint32, used to derive per-asset sub-seeds. */
function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic rng for a named asset (order of generation never matters). */
function rngFor(name) {
  return mulberry32(MASTER_SEED ^ hashString(name))
}

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))
const randPick = (rng, arr) => arr[Math.floor(rng() * arr.length)]

// ---------------------------------------------------------------------------
// PNG: CRC32 + encoder + IHDR reader
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** RGBA (Uint8Array w*h*4, non-premultiplied) → PNG buffer (8-bit truecolour+alpha). */
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour with alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter type: None (deterministic, simple)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowStart + 1)
  }
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Reads width/height out of a PNG's IHDR chunk. Throws on malformed input. */
function readIHDR(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a PNG file')
  }
  let offset = 8
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    if (type === 'IHDR') {
      if (length < 13) throw new Error('truncated IHDR')
      return {
        width: buf.readUInt32BE(offset + 8),
        height: buf.readUInt32BE(offset + 12),
        bitDepth: buf[offset + 16],
        colorType: buf[offset + 17],
      }
    }
    offset += 12 + length
  }
  throw new Error('IHDR chunk not found')
}

/**
 * Full RGBA decode (8-bit truecolour+alpha, non-interlaced) — used by
 * --verify to check actual pixel content, not just chunk headers.
 */
function decodeRGBA(buf) {
  const ihdr = readIHDR(buf)
  if (ihdr.bitDepth !== 8 || ihdr.colorType !== 6) {
    throw new Error(`unsupported PNG format (bitDepth=${ihdr.bitDepth}, colorType=${ihdr.colorType})`)
  }
  const { width: w, height: h } = ihdr
  const idat = []
  let offset = 8
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') idat.push(buf.subarray(offset + 8, offset + 8 + length))
    if (type === 'IEND') break
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * 4
  if (raw.length !== (stride + 1) * h) throw new Error('unexpected IDAT size')

  const out = Buffer.alloc(stride * h)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0
      const b = prev[x]
      const c = x >= 4 ? prev[x - 4] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (ft !== 0) throw new Error(`unknown PNG filter type ${ft}`)
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride)
    prev = cur
  }
  return { width: w, height: h, rgba: out }
}

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------

/** '#rrggbb' | '#rrggbbaa' → [r, g, b, a] (0..255) */
function hex(color) {
  const value = color.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255
  return [r, g, b, a]
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

/** mix two colours (arrays) with t ∈ [0,1] */
function mix(a, b, t) {
  const a3 = a[3] ?? 255
  const b3 = b[3] ?? 255
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a3 + (b3 - a3) * t,
  ]
}

/** multiply brightness (1 = unchanged) */
function shade(color, f) {
  return [color[0] * f, color[1] * f, color[2] * f, color[3]]
}

/** set alpha only */
function alpha(color, a) {
  return [color[0], color[1], color[2], a]
}

/** hue-rotate-ish darkening: shift toward a dark tint of itself */
function darkenHue(color, t) {
  const tint = [color[0] * 0.35, color[1] * 0.38, color[2] * 0.3, color[3] ?? 255]
  return mix(color, tint, t)
}

function lighten(color, t) {
  return mix(color, [255, 255, 255, color[3]], t)
}

// ---------------------------------------------------------------------------
// canvas + drawing primitives
// ---------------------------------------------------------------------------

class Canvas {
  constructor(w, h, wrap = false) {
    this.w = w
    this.h = h
    this.wrap = wrap
    this.d = new Uint8Array(w * h * 4)
  }

  idx(x, y) {
    if (this.wrap) {
      const wx = ((Math.round(x) % this.w) + this.w) % this.w
      const wy = ((Math.round(y) % this.h) + this.h) % this.h
      return (wy * this.w + wx) * 4
    }
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return -1
    return (iy * this.w + ix) * 4
  }

  opaque(x, y) {
    const i = this.idx(x, y)
    return i >= 0 && this.d[i + 3] > 8
  }

  at(x, y) {
    const i = this.idx(x, y)
    if (i < 0) return null
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]
  }

  /** source-over composite of colour `col` (with optional multiplier `mul`) */
  set(x, y, col, mul = 1) {
    const i = this.idx(x, y)
    if (i < 0 || mul <= 0) return
    const ca = col[3]
    if (!Number.isFinite(ca) || !Number.isFinite(col[0]) || !Number.isFinite(col[1]) || !Number.isFinite(col[2])) {
      throw new Error(`invalid colour (would bake a corrupt pixel): ${JSON.stringify(col)}`)
    }
    const sa = ((ca / 255) * mul)
    if (sa <= 0) return
    const d = this.d
    const da = d[i + 3] / 255
    const oa = sa + da * (1 - sa)
    if (oa <= 0) return
    d[i] = clamp255((col[0] * sa + d[i] * da * (1 - sa)) / oa)
    d[i + 1] = clamp255((col[1] * sa + d[i + 1] * da * (1 - sa)) / oa)
    d[i + 2] = clamp255((col[2] * sa + d[i + 2] * da * (1 - sa)) / oa)
    d[i + 3] = clamp255(oa * 255)
  }

  clearAt(x, y) {
    const i = this.idx(x, y)
    if (i < 0) return
    this.d[i] = 0
    this.d[i + 1] = 0
    this.d[i + 2] = 0
    this.d[i + 3] = 0
  }

  /** reset to fully transparent */
  clear() {
    this.d.fill(0)
  }

  opaqueCount() {
    let n = 0
    for (let i = 3; i < this.d.length; i += 4) if (this.d[i] > 8) n++
    return n
  }
}

function fillRect(c, x, y, w, h, col) {
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  for (let yy = y0; yy < y0 + h; yy++) {
    for (let xx = x0; xx < x0 + w; xx++) c.set(xx, yy, col)
  }
}

function fillEllipse(c, cx, cy, rx, ry, col, clip = false) {
  const x0 = Math.floor(cx - rx) - 1
  const x1 = Math.ceil(cx + rx) + 1
  const y0 = Math.floor(cy - ry) - 1
  const y1 = Math.ceil(cy + ry) + 1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy > 1) continue
      if (clip && !c.opaque(x, y)) continue
      c.set(x, y, col)
    }
  }
}

function fillCircle(c, cx, cy, r, col, clip = false) {
  fillEllipse(c, cx, cy, r, r, col, clip)
}

/** even-odd scanline polygon fill */
function fillPoly(c, points, col, clip = false) {
  let minY = Infinity
  let maxY = -Infinity
  for (const [, y] of points) {
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const n = points.length
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const yc = y + 0.5
    const xs = []
    for (let i = 0; i < n; i++) {
      const [ax, ay] = points[i]
      const [bx, by] = points[(i + 1) % n]
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.ceil(xs[k] - 0.5)
      const to = Math.floor(xs[k + 1] - 0.5)
      for (let x = from; x <= to; x++) {
        if (clip && !c.opaque(x, y)) continue
        c.set(x, y, col)
      }
    }
  }
}

function drawLine(c, x0, y0, x1, y1, col, width = 1) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    if (width <= 1) c.set(x, y, col)
    else fillCircle(c, x, y, width / 2, col)
  }
}

/** quadratic bezier stroke with varying width: widthAt(t) → pixels */
function drawCurve(c, x0, y0, cx, cy, x1, y1, col, widthAt) {
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1
    const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1
    const w = widthAt(t)
    if (w <= 1) c.set(Math.round(x), Math.round(y), col)
    else fillCircle(c, x, y, w / 2, col)
  }
}

/** dark silhouette outline: paints transparent pixels touching opaque ones */
function outline(c, col) {
  const marks = []
  for (let y = -1; y <= c.h; y++) {
    for (let x = -1; x <= c.w; x++) {
      if (c.opaque(x, y)) continue
      let touch = false
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (c.opaque(x + dx, y + dy)) {
            touch = true
            break
          }
        }
      }
      if (touch) marks.push([x, y])
    }
  }
  for (const [x, y] of marks) c.set(x, y, col)
}

/** random per-pixel colour sprinkling over existing opaque pixels */
function speckle(c, rng, amount, col, mul = 1) {
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (!c.opaque(x, y)) continue
      if (rng() < amount) c.set(x, y, col, mul)
    }
  }
}

/** blit src onto dst at (dx,dy) with alpha compositing */
function blit(src, dst, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4
      const a = src.d[si + 3]
      if (a <= 0) continue
      dst.set(dx + x, dy + y, [src.d[si], src.d[si + 1], src.d[si + 2], a])
    }
  }
}

function flipX(src) {
  const out = new Canvas(src.w, src.h, src.wrap)
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4
      const di = (y * src.w + (src.w - 1 - x)) * 4
      out.d[di] = src.d[si]
      out.d[di + 1] = src.d[si + 1]
      out.d[di + 2] = src.d[si + 2]
      out.d[di + 3] = src.d[si + 3]
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// periodic noise (tileable on both axes)
// ---------------------------------------------------------------------------

function makePeriodicNoise(rng, period) {
  const grid = new Float32Array(period * period)
  for (let i = 0; i < grid.length; i++) grid[i] = rng()
  return (x, y) => {
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const xa = ((x0 % period) + period) % period
    const ya = ((y0 % period) + period) % period
    const xb = (xa + 1) % period
    const yb = (ya + 1) % period
    const v00 = grid[ya * period + xa]
    const v10 = grid[ya * period + xb]
    const v01 = grid[yb * period + xa]
    const v11 = grid[yb * period + xb]
    const top = v00 + (v10 - v00) * sx
    const bot = v01 + (v11 - v01) * sx
    return top + (bot - top) * sy
  }
}

/** value-noise sampler over a `size`px tile; wraps seamlessly on both axes */
function tileNoise(rng, size, period) {
  const n = makePeriodicNoise(rng, period)
  const scale = period / size
  return (x, y) => n(x * scale, y * scale)
}

/** 2-octave version of the above */
function tileNoiseFbm(rng, size, period) {
  const a = tileNoise(rng, size, period)
  const b = tileNoise(rng, size, period * 2)
  return (x, y) => a(x, y) * 0.65 + b(x, y) * 0.35
}

// ---------------------------------------------------------------------------
// palettes — earthy forest tones, rooted in src/index.css design tokens
// ---------------------------------------------------------------------------

const PAL = {
  bark950: hex('#171c14'),
  bark900: hex('#1f2719'),
  bark800: hex('#2b3623'),
  bark700: hex('#3c4a31'),
  bark600: hex('#516143'),
  bark500: hex('#6b7d59'),

  moss600: hex('#4c7230'),
  moss500: hex('#5f8a3a'),
  moss400: hex('#7fae56'),
  leaf300: hex('#a8c97a'),

  water700: hex('#2e5f7a'),
  water600: hex('#3d7a99'),
  water500: hex('#5a9bb8'),

  soil700: hex('#5a4632'),
  soil600: hex('#755c42'),
  soil500: hex('#94755a'),

  parchment50: hex('#f7f4ec'),
  parchment100: hex('#efe9dc'),
  parchment200: hex('#e2dac8'),
  parchment300: hex('#cdc3ab'),

  danger500: hex('#c4552f'),
  danger600: hex('#a5431f'),
  amber: hex('#d9a441'),

  // extended tones (kept in the same earthy family)
  trunk: hex('#6b4f2e'),
  trunkDark: hex('#4a361f'),
  trunkLight: hex('#8d6c44'),
  pine: hex('#3f6b34'),
  pineLight: hex('#5e8f48'),
  pineDark: hex('#2c4d26'),
  sand: hex('#d3bd8a'),
  sandDark: hex('#b49f70'),
  sandLight: hex('#e6d6ab'),
  stone: hex('#86887f'),
  stoneDark: hex('#5f625b'),
  stoneLight: hex('#a9aba1'),
  snow: hex('#dfe6e6'),
  waterDeep: hex('#1d4560'),
  waterFoam: hex('#a8d4e2'),
  mudDark: hex('#3d3020'),
  mush: hex('#b8552f'),
}

// ---------------------------------------------------------------------------
// terrain tiles — 48x48, seamless on both axes (wrapped canvas + periodic noise)
// ---------------------------------------------------------------------------

const TILE_SIZE = 48

function drawGrassTile(c, rng) {
  const n = tileNoiseFbm(rng, TILE_SIZE, 6)
  const clump = tileNoise(rng, TILE_SIZE, 4)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = n(x, y)
      let col = mix(PAL.moss600, PAL.moss400, v)
      const k = clump(x, y)
      if (k > 0.72) col = mix(col, PAL.bark700, 0.25)
      else if (k < 0.22) col = mix(col, PAL.leaf300, 0.2)
      c.set(x, y, col)
    }
  }
  // blades — short vertical strokes, deterministic scatter (wraps at edges)
  const blades = randInt(rng, 34, 44)
  for (let i = 0; i < blades; i++) {
    const x = randInt(rng, 0, TILE_SIZE - 1)
    const y = randInt(rng, 0, TILE_SIZE - 1)
    const light = rng() > 0.45
    const col = light ? mix(PAL.moss400, PAL.leaf300, rng() * 0.7) : shade(PAL.moss600, 0.78)
    const h = randInt(rng, 1, 3)
    for (let k = 0; k < h; k++) c.set(x + (k === 0 ? 0 : rng() > 0.5 ? 0 : -1), y - k, col)
  }
}

function drawForestFloorTile(c, rng) {
  const n = tileNoiseFbm(rng, TILE_SIZE, 6)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = n(x, y)
      let col = mix(hex('#3a3324'), hex('#57492f'), v)
      if (v > 0.68) col = mix(col, PAL.bark700, 0.35)
      c.set(x, y, col)
    }
  }
  // leaf litter — small tilted ovals in amber/brown
  const leaves = randInt(rng, 22, 30)
  const leafCols = [hex('#9a7434'), hex('#b98b3e'), hex('#7c5a2c'), hex('#a8642f'), hex('#6d5a33')]
  for (let i = 0; i < leaves; i++) {
    const x = randInt(rng, -2, TILE_SIZE + 1)
    const y = randInt(rng, -2, TILE_SIZE + 1)
    const rx = 1.6 + rng() * 2.2
    const col = randPick(rng, leafCols)
    fillEllipse(c, x, y, rx, rx * 0.55, col)
    fillEllipse(c, x - rx * 0.25, y - rx * 0.2, rx * 0.5, rx * 0.3, lighten(col, 0.28))
  }
  // twigs
  const twigs = randInt(rng, 3, 6)
  for (let i = 0; i < twigs; i++) {
    const x = randInt(rng, 0, TILE_SIZE - 1)
    const y = randInt(rng, 0, TILE_SIZE - 1)
    const len = randInt(rng, 5, 12)
    const ang = rng() * Math.PI
    drawLine(
      c,
      x,
      y,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len,
      hex('#5b452a'),
      rng() > 0.6 ? 2 : 1,
    )
  }
}

function drawDirtTile(c, rng) {
  const n = tileNoiseFbm(rng, TILE_SIZE, 6)
  const patch = tileNoise(rng, TILE_SIZE, 3)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = n(x, y)
      let col = mix(hex('#6b543c'), hex('#8b6f4f'), v)
      if (patch(x, y) > 0.66) col = mix(col, hex('#54422e'), 0.4)
      c.set(x, y, col)
    }
  }
  // pebbles
  const pebbles = randInt(rng, 6, 11)
  for (let i = 0; i < pebbles; i++) {
    const x = randInt(rng, 0, TILE_SIZE - 1)
    const y = randInt(rng, 0, TILE_SIZE - 1)
    const r = 1.5 + rng() * 2.4
    const base = mix(PAL.stone, hex('#7a6a52'), rng() * 0.6)
    fillEllipse(c, x, y, r, r * 0.8, darkenHue(base, 0.35))
    fillEllipse(c, x, y, r - 0.7, r * 0.8 - 0.7, base)
    fillEllipse(c, x - r * 0.25, y - r * 0.25, r * 0.45, r * 0.35, lighten(base, 0.35))
  }
  // fine grain
  speckle(c, rng, 0.06, hex('#5c4832'))
  speckle(c, rng, 0.03, hex('#9c8060'))
}

function drawMudTile(c, rng) {
  const n = tileNoiseFbm(rng, TILE_SIZE, 5)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = n(x, y)
      let col = mix(hex('#4a3b28'), hex('#6a563a'), v)
      if (v > 0.72) col = mix(col, hex('#7d6a4a'), 0.5)
      c.set(x, y, col)
    }
  }
  // wet glossy patches — light on top-left of each blob
  const blobs = randInt(rng, 5, 9)
  for (let i = 0; i < blobs; i++) {
    const x = randInt(rng, 0, TILE_SIZE - 1)
    const y = randInt(rng, 0, TILE_SIZE - 1)
    const rx = 3 + rng() * 6
    const ry = rx * (0.55 + rng() * 0.3)
    fillEllipse(c, x, y, rx, ry, mix(hex('#3f331f'), hex('#4f422b'), rng()))
    fillEllipse(c, x - rx * 0.25, y - ry * 0.35, rx * 0.6, ry * 0.5, alpha(hex('#8a9a6a'), 90), true)
  }
  // dark dents
  speckle(c, rng, 0.05, hex('#372c1c'))
}

function drawSandTile(c, rng) {
  const n = tileNoiseFbm(rng, TILE_SIZE, 6)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      // gentle horizontal ripples (period 12 divides 48 → seamless)
      const ripple = Math.sin((2 * Math.PI * y) / 12) * 0.5 + Math.sin((2 * Math.PI * (x + y)) / 24) * 0.3
      const v = n(x, y)
      let col = mix(PAL.sandDark, PAL.sandLight, v * 0.75 + 0.25 + ripple * 0.12)
      c.set(x, y, col)
    }
  }
  speckle(c, rng, 0.09, hex('#a08a5c'))
  speckle(c, rng, 0.05, hex('#efe1b6'))
  // scattered grit
  const grit = randInt(rng, 8, 14)
  for (let i = 0; i < grit; i++) {
    const x = randInt(rng, 0, TILE_SIZE - 1)
    const y = randInt(rng, 0, TILE_SIZE - 1)
    c.set(x, y, hex('#93804f'))
    if (rng() > 0.5) c.set(x + 1, y, hex('#93804f'))
  }
}

function drawRockTile(c, rng) {
  const n = tileNoiseFbm(rng, TILE_SIZE, 5)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = n(x, y)
      const col = mix(PAL.stoneDark, PAL.stone, v)
      c.set(x, y, col)
    }
  }
  // faceted plates — light top-left, dark bottom-right
  const facets = randInt(rng, 4, 6)
  for (let i = 0; i < facets; i++) {
    const cx = randInt(rng, 0, TILE_SIZE - 1)
    const cy = randInt(rng, 0, TILE_SIZE - 1)
    const r = 7 + rng() * 9
    const pts = []
    const sides = randInt(rng, 5, 7)
    const rot = rng() * Math.PI
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * Math.PI * 2
      const rr = r * (0.7 + rng() * 0.5)
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8])
    }
    fillPoly(c, pts, mix(PAL.stone, hex('#969890'), 0.4))
    const top = pts.map(([px, py]) => [px - 1.5, py - 1.5])
    fillPoly(c, top, lighten(PAL.stone, 0.22), true)
    const bot = pts.map(([px, py]) => [px + 1.5, py + 1.8])
    fillPoly(c, bot, darkenHue(PAL.stone, 0.3), true)
  }
  // cracks
  const cracks = randInt(rng, 3, 5)
  for (let i = 0; i < cracks; i++) {
    const x = randInt(rng, 0, TILE_SIZE - 1)
    const y = randInt(rng, 0, TILE_SIZE - 1)
    const len = randInt(rng, 8, 18)
    const ang = rng() * Math.PI * 2
    let px = x
    let py = y
    for (let s = 0; s < len; s++) {
      px += Math.cos(ang) + (rng() - 0.5) * 1.2
      py += Math.sin(ang) + (rng() - 0.5) * 1.2
      c.set(px, py, hex('#4c4f49'))
      if (rng() > 0.7) c.set(px, py + 1, hex('#5c5f58'))
    }
  }
  speckle(c, rng, 0.05, PAL.stoneLight, 0.7)
}

function drawMountainTile(c, rng) {
  const n = tileNoiseFbm(rng, TILE_SIZE, 5)
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = n(x, y)
      let col = mix(hex('#565a55'), hex('#7c7f77'), v)
      // altitude-ish lightening toward the top of the tile (wraps vertically)
      col = mix(col, hex('#8f8f86'), Math.max(0, (y - TILE_SIZE * 0.5) / TILE_SIZE) * 0.4)
      c.set(x, y, col)
    }
  }
  // craggy facets
  const crags = randInt(rng, 5, 8)
  for (let i = 0; i < crags; i++) {
    const cx = randInt(rng, 0, TILE_SIZE - 1)
    const cy = randInt(rng, 0, TILE_SIZE - 1)
    const w = 8 + rng() * 12
    const h = 7 + rng() * 11
    const pts = [
      [cx, cy - h * 0.6],
      [cx + w * 0.5, cy + h * 0.1],
      [cx + w * 0.2, cy + h * 0.55],
      [cx - w * 0.4, cy + h * 0.35],
      [cx - w * 0.5, cy - h * 0.1],
    ]
    fillPoly(c, pts, mix(hex('#6a6d66'), hex('#8a8d84'), rng()))
    fillPoly(
      c,
      pts.map(([px, py]) => [px - 1.5, py - 1.5]),
      lighten(hex('#8f9189'), 0.18),
      true,
    )
    fillPoly(
      c,
      pts.map(([px, py]) => [px + 1.5, py + 1.5]),
      darkenHue(hex('#5a5d57'), 0.35),
      true,
    )
  }
  // snow dust catching light on upper faces
  const dust = randInt(rng, 10, 18)
  for (let i = 0; i < dust; i++) {
    const x = randInt(rng, 0, TILE_SIZE - 1)
    const y = randInt(rng, 0, TILE_SIZE - 1)
    fillEllipse(c, x, y, 1 + rng() * 2, 1 + rng(), alpha(PAL.snow, 160 + Math.floor(rng() * 60)))
  }
  speckle(c, rng, 0.04, hex('#43463f'))
}

/** water: shared static base + phase-shifted travelling waves (animation frames) */
function drawWaterTile(c, kind, frame, frames) {
  const cfg = {
    shallowWater: {
      base: hex('#4a89a6'),
      light: hex('#8fcadd'),
      deep: hex('#2f6a86'),
      silt: hex('#a9b98a'),
      waveAmp: 0.8,
    },
    deepWater: {
      base: hex('#2e5f7a'),
      light: hex('#69a8c2'),
      deep: hex('#173a52'),
      silt: null,
      waveAmp: 0.75,
    },
    wetland: {
      base: hex('#4c6444'),
      light: hex('#7d9a63'),
      deep: hex('#33472f'),
      silt: hex('#6d7a4a'),
      waveAmp: 1.0,
    },
  }[kind]

  // static body of water — identical in every frame of this kind
  const baseNoise = tileNoiseFbm(rngFor(`water-base:${kind}`), TILE_SIZE, 6)
  const phase = (frame / frames) * Math.PI * 2

  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const v = baseNoise(x, y)
      let col = mix(shade(cfg.base, 0.82), cfg.base, v)
      if (cfg.silt && v > 0.62) col = mix(col, cfg.silt, (v - 0.62) * 1.4)

      // all wave periods divide 48 → the tile wraps seamlessly
      const wave =
        cfg.waveAmp *
        (0.55 * Math.sin((2 * Math.PI * x) / 16 - phase) +
          0.4 * Math.sin((2 * Math.PI * (x + y)) / 24 + phase) +
          0.3 * Math.sin((2 * Math.PI * y) / 12 - phase * 0.5) +
          (v - 0.5) * 0.5)

      if (wave > 0.5) col = mix(col, cfg.light, Math.min(1, (wave - 0.5) * 1.6))
      else if (wave < -0.55) col = mix(col, cfg.deep, Math.min(1, (-wave - 0.55) * 1.5))
      c.set(x, y, col)
    }
  }

  // static detail shared across frames (same seed + same traversal order)
  const detail = rngFor(`water-detail:${kind}`)
  speckle(c, detail, 0.03, alpha(cfg.light, 200))
  if (kind === 'wetland') {
    // reeds poking through, static across the 2 frames
    const reeds = randInt(detail, 6, 10)
    for (let i = 0; i < reeds; i++) {
      const x = randInt(detail, 0, TILE_SIZE - 1)
      const y = randInt(detail, 0, TILE_SIZE - 1)
      drawLine(c, x, y, x + detail() * 2 - 1, y - randInt(detail, 2, 5), hex('#5f7a3a'), 1)
      c.set(x, y - 3, hex('#7c9147'))
    }
  } else {
    // a couple of foam dashes, static
    const foam = randInt(detail, 4, 7)
    for (let i = 0; i < foam; i++) {
      const x = randInt(detail, 0, TILE_SIZE - 1)
      const y = randInt(detail, 0, TILE_SIZE - 1)
      const len = randInt(detail, 3, 7)
      for (let k = 0; k < len; k++) c.set(x + k, y - (k > len / 2 ? 1 : 0), alpha(PAL.waterFoam, 150))
    }
  }
}

/** per-kind tile dispatch (frames only matter for water) */
const TILE_DRAWERS = {
  grass: (c, rng) => drawGrassTile(c, rng),
  forestFloor: (c, rng) => drawForestFloorTile(c, rng),
  dirt: (c, rng) => drawDirtTile(c, rng),
  mud: (c, rng) => drawMudTile(c, rng),
  sand: (c, rng) => drawSandTile(c, rng),
  rock: (c, rng) => drawRockTile(c, rng),
  mountain: (c, rng) => drawMountainTile(c, rng),
  shallowWater: (c, _rng, frame) => drawWaterTile(c, 'shallowWater', frame, 4),
  deepWater: (c, _rng, frame) => drawWaterTile(c, 'deepWater', frame, 4),
  wetland: (c, _rng, frame) => drawWaterTile(c, 'wetland', frame, 2),
}

// ---------------------------------------------------------------------------
// vegetation sprites — transparent, clear silhouettes, light from top-left
// ---------------------------------------------------------------------------

const OUTLINE_PLANT = hex('#1b2314')
const OUTLINE_STONE = hex('#33352f')

/** layered leafy canopy: mid body + top-left light + bottom-right shade + texture */
function leafCanopy(c, lobes, mid, light, dark, rng, texture = 1) {
  for (const [lx, ly, lrx, lry] of lobes) fillEllipse(c, lx, ly, lrx, lry, mid)
  for (const [lx, ly, lrx, lry] of lobes) {
    fillEllipse(c, lx + lrx * 0.22, ly + lry * 0.3, lrx * 0.8, lry * 0.75, dark, true)
    fillEllipse(c, lx - lrx * 0.26, ly - lry * 0.3, lrx * 0.62, lry * 0.55, light, true)
  }
  speckle(c, rng, 0.1 * texture, light, 0.85)
  speckle(c, rng, 0.1 * texture, dark, 0.7)
  speckle(c, rng, 0.04 * texture, lighten(light, 0.35), 0.8)
}

function barkTrunk(c, cx, topY, botY, baseW, rng) {
  for (let y = topY; y <= botY; y++) {
    const t = (y - topY) / Math.max(1, botY - topY)
    const half = (baseW * (1 + t * 0.65)) / 2
    for (let x = cx - half; x <= cx + half; x++) c.set(x, y, PAL.trunk)
    // light on the left face, shadow on the right face
    c.set(cx - half, y, PAL.trunkLight)
    c.set(cx + half, y, PAL.trunkDark)
  }
  const strokes = Math.max(2, Math.floor(baseW / 4))
  for (let i = 0; i < strokes; i++) {
    const sx = cx - baseW * 0.4 + rng() * baseW * 0.8
    const len = 4 + rng() * (botY - topY) * 0.5
    const sy = topY + rng() * Math.max(1, botY - topY - len)
    for (let k = 0; k < len; k++) c.set(sx, sy + k, alpha(PAL.trunkDark, 150))
  }
}

function drawOak(c, rng, opts) {
  const { trunkW, rx, ry, cyFrac, gnarled = false } = opts
  const w = c.w
  const h = c.h
  const cx = w / 2
  const canopyCy = h * cyFrac
  const groundY = h - 1
  const trunkTop = canopyCy + ry * 0.4

  barkTrunk(c, cx, trunkTop, groundY, trunkW, rng)

  // root flares
  fillEllipse(c, cx - trunkW * 0.5, groundY, trunkW * 0.5, 2.5, PAL.trunk)
  fillEllipse(c, cx + trunkW * 0.5, groundY, trunkW * 0.5, 2.5, shade(PAL.trunk, 0.85))

  const mid = PAL.moss600
  const light = PAL.moss400
  const dark = hex('#33531f')
  const lean = gnarled ? (rng() - 0.5) * rx * 0.16 : 0
  const lobes = [
    [cx + lean, canopyCy, rx, ry],
    [cx - rx * 0.55 + lean, canopyCy + ry * 0.3, rx * 0.55, ry * 0.62],
    [cx + rx * 0.58 + lean, canopyCy + ry * 0.24, rx * 0.5, ry * 0.56],
    [cx - rx * 0.2 + lean, canopyCy - ry * 0.42, rx * 0.55, ry * 0.45],
  ]
  if (gnarled) {
    lobes.push([cx + rx * 0.18 + lean, canopyCy - ry * 0.3, rx * 0.5, ry * 0.4])
    // a bare dead branch poking out
    drawCurve(c, cx + rx * 0.3, canopyCy + ry * 0.2, cx + rx * 0.7, canopyCy - ry * 0.2,
      cx + rx * 0.95, canopyCy - ry * 0.55, PAL.trunkDark, (t) => 3 - t * 2)
  }
  leafCanopy(c, lobes, mid, light, dark, rng)

  if (gnarled) {
    // sparse crown — punch a couple of holes so the old tree reads as thinning
    for (let i = 0; i < 4; i++) {
      const hx = cx + (rng() - 0.5) * rx * 1.7 + lean
      const hy = canopyCy + (rng() - 0.5) * ry * 1.7
      const rr = 2 + rng() * 3
      for (let y = Math.floor(hy - rr); y <= Math.ceil(hy + rr); y++) {
        for (let x = Math.floor(hx - rr); x <= Math.ceil(hx + rr); x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue
          const dx = x + 0.5 - hx
          const dy = y + 0.5 - hy
          if (dx * dx + dy * dy <= rr * rr) c.clearAt(x, y)
        }
      }
    }
  }

  outline(c, OUTLINE_PLANT)
}

function drawPine(c, rng, opts) {
  const { trunkW, layers, baseHalfW, layerH, gap, cyBase } = opts
  const w = c.w
  const h = c.h
  const cx = w / 2
  const groundY = h - 1
  const topY = h * 0.06

  barkTrunk(c, cx, topY + 2, groundY, trunkW, rng)

  for (let i = 0; i < layers; i++) {
    const bottomY = h * cyBase - i * gap
    const halfW = baseHalfW * (1 - i * 0.24)
    const tipY = bottomY - layerH
    const pts = [
      [cx, tipY],
      [cx + halfW, bottomY],
      [cx - halfW, bottomY],
    ]
    const mid = mix(PAL.pine, PAL.pineDark, i * 0.12)
    fillPoly(c, pts, mid)
    fillPoly(
      c,
      pts.map(([px, py]) => [px - halfW * 0.22 - 1, py - 2]),
      PAL.pineLight,
      true,
    )
    fillPoly(
      c,
      pts.map(([px, py]) => [px + halfW * 0.3 + 1, py + 1.5]),
      PAL.pineDark,
      true,
    )
    // needle texture along the tier
    const needles = Math.floor(halfW * 2)
    for (let k = 0; k < needles; k++) {
      const t = rng()
      const ny = tipY + t * (bottomY - tipY)
      const nx = cx + (rng() - 0.5) * halfW * 2 * t
      c.set(nx, ny, rng() > 0.5 ? alpha(PAL.pineLight, 170) : alpha(PAL.pineDark, 170))
    }
  }
  outline(c, OUTLINE_PLANT)
}

function drawDeadTree(c, rng, opts) {
  const { trunkW, trunkH, grey = false } = opts
  const w = c.w
  const h = c.h
  const cx = w / 2
  const groundY = h - 1
  const bark = grey ? hex('#6a6255') : hex('#5d5344')
  const barkLight = grey ? hex('#8a8274') : hex('#7a6f5c')
  const barkDark = grey ? hex('#494238') : hex('#3f382c')

  const topY = groundY - h * trunkH
  barkTrunk(c, cx, topY, groundY, trunkW, rng)
  // repaint the dead trunk in its own palette
  for (let y = topY; y <= groundY; y++) {
    const t = (y - topY) / Math.max(1, groundY - topY)
    const half = (trunkW * (1 + t * 0.7)) / 2
    for (let x = cx - half; x <= cx + half; x++) c.set(x, y, bark)
    c.set(cx - half, y, barkLight)
    c.set(cx + half, y, barkDark)
  }
  fillEllipse(c, cx, topY, trunkW * 0.5, trunkH * 0.03 + 1.5, barkLight)

  // bare branching crown
  const grow = (x, y, ang, len, wd, depth) => {
    const x2 = x + Math.cos(ang) * len
    const y2 = y + Math.sin(ang) * len
    const steps = Math.max(2, Math.ceil(len * 2))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const px = x + (x2 - x) * t
      const py = y + (y2 - y) * t
      const rw = wd * (1 - t * 0.4)
      if (rw <= 1) c.set(px, py, bark)
      else fillCircle(c, px, py, rw / 2, bark)
      if (rw > 1.5) c.set(px - rw * 0.3, py - rw * 0.3, barkLight)
    }
    if (depth <= 0) return
    const branches = rng() > 0.35 ? 2 : 1
    for (let b = 0; b < branches; b++) {
      const spread = 0.45 + rng() * 0.55
      grow(
        x2,
        y2,
        ang + (b === 0 ? -spread : spread) + (rng() - 0.5) * 0.25,
        len * (0.55 + rng() * 0.2),
        Math.max(1, wd * 0.55),
        depth - 1,
      )
    }
  }

  const crownY = topY + trunkH * 0.06
  grow(cx, crownY, -Math.PI / 2 - 0.5, h * 0.22, Math.max(2, trunkW * 0.5), 3)
  grow(cx, crownY + h * 0.06, -Math.PI / 2 + 0.55, h * 0.2, Math.max(2, trunkW * 0.45), 3)
  if (h > 60) grow(cx + trunkW * 0.3, crownY + h * 0.14, -Math.PI / 2 + 1.15, h * 0.14, 2, 2)

  outline(c, hex('#241f18'))
}

function drawFern(c, rng) {
  const baseX = c.w / 2
  const baseY = c.h - 1
  const fronds = 7
  for (let i = 0; i < fronds; i++) {
    const spread = (i / (fronds - 1) - 0.5) * 2 // -1..1
    const front = Math.abs(spread) < 0.6
    const col = front ? PAL.moss500 : PAL.pine
    const tipX = baseX + spread * c.w * 0.46
    const tipY = baseY - c.h * (0.5 + 0.42 * (1 - Math.abs(spread) * 0.8))
    const ctrlX = baseX + spread * c.w * 0.12
    const ctrlY = baseY - c.h * 0.72
    // arching rachis
    drawCurve(c, baseX, baseY, ctrlX, ctrlY, tipX, tipY, shade(col, 0.8), (t) => 2.4 - t * 1.6)
    // leaflets along the frond
    for (let k = 1; k <= 7; k++) {
      const t = k / 8
      const mt = 1 - t
      const px = mt * mt * baseX + 2 * mt * t * ctrlX + t * t * tipX
      const py = mt * mt * baseY + 2 * mt * t * ctrlY + t * t * tipY
      const size = (2.6 - t * 1.7) * (0.85 + rng() * 0.3)
      fillEllipse(c, px - size * 0.9, py, size, size * 0.6, col)
      fillEllipse(c, px + size * 0.9, py + 0.5, size, size * 0.6, shade(col, 0.88))
      if (rng() > 0.5) fillEllipse(c, px - size * 0.9, py - 0.6, size * 0.6, size * 0.35, PAL.moss400)
    }
  }
  outline(c, OUTLINE_PLANT)
}

function drawWildflower(c, rng, petalCol, centerCol) {
  const baseX = c.w / 2
  const baseY = c.h - 1
  const stems = 3
  const heads = []
  for (let i = 0; i < stems; i++) {
    const spread = (i / (stems - 1) - 0.5) * 2
    const tipX = baseX + spread * c.w * 0.34
    const tipY = baseY - c.h * (0.5 + (i === 1 ? 0.42 : 0.2 + rng() * 0.14))
    drawCurve(
      c, baseX + spread * 2, baseY,
      baseX + spread * c.w * 0.1, baseY - c.h * 0.5,
      tipX, tipY,
      PAL.moss600, (t) => 2.2 - t * 1.1,
    )
    // a leaf midway
    const lx = baseX + spread * c.w * 0.14
    const ly = baseY - c.h * 0.34
    fillEllipse(c, lx + (spread >= 0 ? 2.5 : -2.5), ly, 3, 1.6, PAL.moss500)
    heads.push([tipX, tipY, i === 1 ? 1 : 0.82])
  }
  for (const [hx, hy, scale] of heads) {
    const petals = 5
    const pr = 2.6 * scale
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * Math.PI * 2 + 0.4
      fillEllipse(c, hx + Math.cos(a) * pr, hy + Math.sin(a) * pr, pr * 0.75, pr * 0.75, petalCol)
      fillEllipse(c, hx + Math.cos(a) * pr - 0.5, hy + Math.sin(a) * pr - 0.5, pr * 0.4, pr * 0.4, lighten(petalCol, 0.35))
    }
    fillCircle(c, hx, hy, pr * 0.7, centerCol)
    fillCircle(c, hx - 0.5, hy - 0.5, pr * 0.35, lighten(centerCol, 0.3))
  }
  outline(c, OUTLINE_PLANT)
}

function drawGrassCluster(c, rng) {
  const baseX = c.w / 2
  const baseY = c.h - 1
  const blades = randInt(rng, 11, 15)
  for (let i = 0; i < blades; i++) {
    const spread = (i / (blades - 1) - 0.5) * 2 + (rng() - 0.5) * 0.3
    const tipX = baseX + spread * c.w * 0.42
    const tipY = baseY - c.h * (0.45 + rng() * 0.5)
    const shadeT = rng()
    const col = shadeT > 0.66 ? PAL.leaf300 : shadeT > 0.33 ? PAL.moss400 : PAL.moss600
    const ctrlX = baseX + spread * c.w * 0.2
    const ctrlY = baseY - c.h * 0.55
    drawCurve(c, baseX + spread * 3, baseY, ctrlX, ctrlY, tipX, tipY, col, (t) => 2.4 - t * 1.7)
    // blade tip catch-light
    c.set(tipX, tipY, lighten(col, 0.3))
  }
  // a few dry blades
  for (let i = 0; i < 3; i++) {
    const spread = rng() - 0.5
    drawCurve(
      c, baseX + spread * 4, baseY,
      baseX + spread * c.w * 0.3, baseY - c.h * 0.4,
      baseX + spread * c.w * 0.7, baseY - c.h * (0.3 + rng() * 0.4),
      hex('#a5964f'), (t) => 2 - t * 1.4,
    )
  }
  outline(c, OUTLINE_PLANT)
}

function drawReeds(c, rng) {
  const baseX = c.w / 2
  const baseY = c.h - 1
  const stems = 6
  for (let i = 0; i < stems; i++) {
    const spread = (i / (stems - 1) - 0.5) * 2
    const sway = (rng() - 0.5) * c.w * 0.18
    const tipX = baseX + spread * c.w * 0.36 + sway
    const tipY = baseY - c.h * (0.62 + rng() * 0.32)
    drawCurve(
      c, baseX + spread * 2, baseY,
      baseX + spread * c.w * 0.16, baseY - c.h * 0.55,
      tipX, tipY,
      i % 2 === 0 ? PAL.moss500 : PAL.pine,
      (t) => 2.3 - t * 1.2,
    )
    if (i % 2 === 0) {
      // cattail head
      fillEllipse(c, tipX, tipY - 2.5, 1.8, 3.4, hex('#6b4a2b'))
      fillEllipse(c, tipX - 0.6, tipY - 3, 0.9, 2, hex('#8a6339'))
      c.set(tipX, tipY - 6, hex('#4a3520'))
    } else {
      fillEllipse(c, tipX + 1.5, tipY, 3, 1.4, PAL.moss400)
    }
  }
  // strap leaves
  for (let i = 0; i < 4; i++) {
    const spread = rng() - 0.5
    drawCurve(
      c, baseX + spread * 5, baseY,
      baseX + spread * c.w * 0.3, baseY - c.h * 0.5,
      baseX + spread * c.w * 0.75, baseY - c.h * (0.4 + rng() * 0.4),
      PAL.pineLight, (t) => 2.6 - t * 2,
    )
  }
  outline(c, OUTLINE_PLANT)
}

function drawMushroom(c, rng) {
  const w = c.w
  const h = c.h
  const cx = w / 2
  const groundY = h - 1
  const capRy = h * 0.3
  const capCy = h * 0.36
  const stemTop = capCy + capRy * 0.3
  const stemW = w * 0.26

  // stem — flares at the base
  for (let y = stemTop; y <= groundY; y++) {
    const t = (y - stemTop) / Math.max(1, groundY - stemTop)
    const half = (stemW * (1 + t * 0.5)) / 2
    for (let x = cx - half; x <= cx + half; x++) c.set(x, y, PAL.parchment200)
    c.set(cx - half, y, PAL.parchment50)
    c.set(cx + half, y, PAL.parchment300)
  }
  // cap
  const capRx = w * 0.44
  fillEllipse(c, cx, capCy, capRx, capRy, PAL.danger600)
  fillEllipse(c, cx + capRx * 0.2, capCy + capRy * 0.3, capRx * 0.85, capRy * 0.75, hex('#7d3116'), true)
  fillEllipse(c, cx - capRx * 0.3, capCy - capRy * 0.3, capRx * 0.6, capRy * 0.5, lighten(PAL.danger500, 0.25), true)
  // gill shadow under the cap rim
  fillEllipse(c, cx, capCy + capRy * 0.8, capRx * 0.7, capRy * 0.3, alpha(hex('#4b2210'), 200), true)
  // cap spots
  const spots = randInt(rng, 3, 5)
  for (let i = 0; i < spots; i++) {
    const a = rng() * Math.PI * 2
    const r = rng() * 0.7
    fillEllipse(
      c,
      cx + Math.cos(a) * capRx * r,
      capCy + Math.sin(a) * capRy * r * 0.8 - capRy * 0.15,
      1.4 + rng() * 1.2,
      1.1 + rng(),
      PAL.parchment100,
    )
  }
  outline(c, hex('#3a1a0e'))
}

function drawRiverPlant(c, rng) {
  const baseX = c.w / 2
  const baseY = c.h - 1
  const blades = 7
  for (let i = 0; i < blades; i++) {
    const spread = (i / (blades - 1) - 0.5) * 2
    const tipX = baseX + spread * c.w * 0.4 + (rng() - 0.5) * 3
    const tipY = baseY - c.h * (0.5 + rng() * 0.45)
    const col = rng() > 0.5 ? hex('#3f7d5c') : hex('#4e9168')
    drawCurve(
      c, baseX + spread * 3, baseY,
      baseX + spread * c.w * 0.05, baseY - c.h * 0.6,
      tipX, tipY,
      col, (t) => 3 - t * 2.2,
    )
  }
  // two broad submerged leaves
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const lx = baseX + side * c.w * 0.24
    const ly = baseY - c.h * (0.3 + i * 0.2)
    const pts = [
      [lx, ly],
      [lx + side * c.w * 0.2, ly - c.h * 0.1],
      [lx + side * c.w * 0.26, ly + c.h * 0.06],
      [lx + side * c.w * 0.06, ly + c.h * 0.12],
    ]
    fillPoly(c, pts, hex('#4a8f66'))
    fillPoly(c, pts.map(([px, py]) => [px, py - 1.5]), hex('#63ad7e'), true)
  }
  outline(c, hex('#15332a'))
}

function drawBush(c, rng) {
  const w = c.w
  const h = c.h
  const cx = w / 2
  const cy = h * 0.55
  // twigs peeking out at the base
  for (let i = 0; i < 4; i++) {
    const x = cx + (rng() - 0.5) * w * 0.5
    drawLine(c, x, h - 1, x + (rng() - 0.5) * 6, h - 1 - rng() * 5, PAL.trunkDark, 2)
  }
  const lobes = [
    [cx, cy, w * 0.46, h * 0.36],
    [cx - w * 0.3, cy + h * 0.16, w * 0.28, h * 0.26],
    [cx + w * 0.3, cy + h * 0.14, w * 0.27, h * 0.25],
    [cx - w * 0.16, cy - h * 0.22, w * 0.3, h * 0.26],
    [cx + w * 0.18, cy - h * 0.18, w * 0.28, h * 0.24],
  ]
  leafCanopy(c, lobes, hex('#456b2c'), hex('#7fae56'), hex('#2c4a1e'), rng, 1.2)
  // berries
  const berries = randInt(rng, 4, 7)
  for (let i = 0; i < berries; i++) {
    const bx = cx + (rng() - 0.5) * w * 0.75
    const by = cy + (rng() - 0.5) * h * 0.7
    if (!c.opaque(bx, by)) continue
    fillCircle(c, bx, by, 1.6, PAL.danger500)
    c.set(bx - 0.5, by - 0.6, lighten(PAL.danger500, 0.4))
  }
  outline(c, OUTLINE_PLANT)
}

function drawStump(c) {
  const w = c.w
  const h = c.h
  const cx = w / 2
  const groundY = h - 1
  const topCy = h * 0.3
  const topRy = h * 0.15
  const topRx = w * 0.36
  const bodyTop = topCy + topRy * 0.5

  // trunk body with flared roots
  const pts = [
    [cx - topRx * 0.9, bodyTop],
    [cx + topRx * 0.9, bodyTop],
    [cx + topRx * 1.12, groundY],
    [cx - topRx * 1.12, groundY],
  ]
  fillPoly(c, pts, PAL.trunk)
  // bark vertical strips
  const strips = 6
  for (let i = 0; i < strips; i++) {
    const sx = cx - topRx + (i + 0.5) * (topRx * 2 / strips)
    const col = i % 2 === 0 ? PAL.trunkDark : shade(PAL.trunk, 0.92)
    for (let y = bodyTop; y <= groundY; y++) c.set(sx + Math.sin(y * 0.6) * 0.6, y, alpha(col, 160))
  }
  // light on the left face
  for (let y = bodyTop; y <= groundY; y++) c.set(cx - topRx * 0.95 - 1, y, PAL.trunkLight)
  // roots
  fillEllipse(c, cx - topRx, groundY, topRx * 0.3, 3, PAL.trunk)
  fillEllipse(c, cx + topRx, groundY, topRx * 0.3, 3, shade(PAL.trunk, 0.85))

  // cut face
  fillEllipse(c, cx, topCy, topRx, topRy, hex('#b99057'))
  fillEllipse(c, cx, topCy, topRx * 0.78, topRy * 0.78, hex('#c9a169'))
  fillEllipse(c, cx, topCy, topRx * 0.5, topRy * 0.5, hex('#b99057'))
  fillEllipse(c, cx, topCy, topRx * 0.22, topRy * 0.22, hex('#c9a169'))
  // radial crack
  drawLine(c, cx, topCy, cx + topRx * 0.85, topCy + topRy * 0.3, hex('#7c5f36'), 1)
  // moss creeping over the top-left rim
  fillEllipse(c, cx - topRx * 0.5, topCy - topRy * 0.4, topRx * 0.4, topRy * 0.5, alpha(PAL.moss500, 235))
  fillEllipse(c, cx - topRx * 0.6, topCy - topRy * 0.5, topRx * 0.25, topRy * 0.3, alpha(PAL.moss400, 235))
  outline(c, hex('#2a1f12'))
}

/** dispatch table: kind → draw(canvas, rng) */
const VEGETATION_DRAWERS = {
  oak_seedling: (c, rng) => drawOak(c, rng, { trunkW: 3, rx: 9, ry: 7.5, cyFrac: 0.3 }),
  oak_young: (c, rng) => drawOak(c, rng, { trunkW: 6, rx: 20, ry: 15, cyFrac: 0.33 }),
  oak_mature: (c, rng) => drawOak(c, rng, { trunkW: 12, rx: 42, ry: 30, cyFrac: 0.35 }),
  oak_old: (c, rng) => drawOak(c, rng, { trunkW: 17, rx: 54, ry: 34, cyFrac: 0.37, gnarled: true }),
  oak_dead: (c, rng) => drawDeadTree(c, rng, { trunkW: 9, trunkH: 0.55 }),
  pine_seedling: (c, rng) =>
    drawPine(c, rng, { trunkW: 3, layers: 2, baseHalfW: 7, layerH: 9, gap: 6, cyBase: 0.78 }),
  pine_young: (c, rng) =>
    drawPine(c, rng, { trunkW: 5, layers: 3, baseHalfW: 16, layerH: 14, gap: 11, cyBase: 0.8 }),
  pine_mature: (c, rng) =>
    drawPine(c, rng, { trunkW: 9, layers: 4, baseHalfW: 34, layerH: 22, gap: 17, cyBase: 0.84 }),
  pine_dead: (c, rng) => drawDeadTree(c, rng, { trunkW: 7, trunkH: 0.68, grey: true }),
  fern: (c, rng) => drawFern(c, rng),
  wildflower_a: (c, rng) => drawWildflower(c, rng, PAL.parchment50, PAL.amber),
  wildflower_b: (c, rng) => drawWildflower(c, rng, PAL.amber, PAL.danger600),
  wildflower_c: (c, rng) => drawWildflower(c, rng, PAL.danger500, PAL.amber),
  grass_cluster: (c, rng) => drawGrassCluster(c, rng),
  reeds: (c, rng) => drawReeds(c, rng),
  mushroom: (c, rng) => drawMushroom(c, rng),
  river_plant: (c, rng) => drawRiverPlant(c, rng),
  bush: (c, rng) => drawBush(c, rng),
  stump: (c) => drawStump(c),
}

// ---------------------------------------------------------------------------
// environment props — rocks, wood, nest, lily pad, fallen tree
// ---------------------------------------------------------------------------

function drawRockProp(c, rng) {
  const w = c.w
  const h = c.h
  const cx = w / 2
  const cy = h * 0.62
  const sides = randInt(rng, 6, 8)
  const rot = rng() * Math.PI
  const pts = []
  for (let k = 0; k < sides; k++) {
    const a = rot + (k / sides) * Math.PI * 2
    const rr = 0.72 + rng() * 0.3
    let px = cx + Math.cos(a) * w * 0.47 * rr
    let py = cy + Math.sin(a) * h * 0.46 * rr
    if (py > h - 1) py = h - 1
    pts.push([px, py])
  }
  fillPoly(c, pts, mix(PAL.stone, PAL.stoneDark, 0.35))
  fillPoly(
    c,
    pts.map(([px, py]) => [px - 2, py - 2]),
    PAL.stoneLight,
    true,
  )
  fillPoly(
    c,
    pts.map(([px, py]) => [px + 2.5, py + 2.5]),
    darkenHue(PAL.stoneDark, 0.3),
    true,
  )
  // crevice + speckle
  const gx = cx + (rng() - 0.5) * w * 0.3
  const gy = cy + (rng() - 0.5) * h * 0.3
  drawLine(c, gx, gy, gx + (rng() - 0.5) * w * 0.4, gy + (rng() - 0.5) * h * 0.4, hex('#4a4d47'), 1)
  speckle(c, rng, 0.08, lighten(PAL.stoneLight, 0.3), 0.7)
  speckle(c, rng, 0.06, PAL.stoneDark, 0.6)
  outline(c, OUTLINE_STONE)
}

function drawLog(c, rng) {
  const w = c.w
  const h = c.h
  const cy = h * 0.52
  const ry = h * 0.42
  const r = ry
  // capsule body
  fillEllipse(c, r, cy, r, ry, PAL.trunk)
  fillRect(c, r, cy - ry, w - r * 2, ry * 2, PAL.trunk)
  fillEllipse(c, w - r, cy, r, ry, PAL.trunk)
  // bark grain along the length
  for (let i = 0; i < 7; i++) {
    const yy = cy - ry + 1 + rng() * (ry * 2 - 2)
    const col = rng() > 0.5 ? alpha(PAL.trunkDark, 170) : alpha(hex('#825f38'), 150)
    const x0 = r * 0.6 + rng() * 4
    const x1 = w - r - rng() * 8
    drawLine(c, x0, yy, x1, yy + (rng() - 0.5) * 2, col, 1)
  }
  // top-left light band
  fillEllipse(c, w * 0.4, cy - ry * 0.55, w * 0.45, ry * 0.3, alpha(PAL.trunkLight, 140), true)
  // end grain on the right
  fillEllipse(c, w - r + 1, cy, r - 1, ry - 1, hex('#b08d5c'))
  fillEllipse(c, w - r + 1, cy, (r - 1) * 0.7, (ry - 1) * 0.7, hex('#9c7a4c'))
  fillEllipse(c, w - r + 1, cy, (r - 1) * 0.4, (ry - 1) * 0.4, hex('#b08d5c'))
  fillEllipse(c, w - r + 1, cy, (r - 1) * 0.16, (ry - 1) * 0.16, hex('#8a6a3e'))
  // moss patch on top
  if (rng() > 0.35) {
    const mx = w * (0.25 + rng() * 0.4)
    fillEllipse(c, mx, cy - ry * 0.7, 6 + rng() * 5, 3 + rng() * 2, alpha(PAL.moss500, 225))
    fillEllipse(c, mx - 2, cy - ry * 0.8, 4, 2, alpha(PAL.moss400, 225))
  }
  outline(c, hex('#2a1f12'))
}

function drawBranch(c, rng) {
  const w = c.w
  const h = c.h
  const x0 = 2
  const y0 = h * 0.78
  const x1 = w - 2
  const y1 = h * 0.24
  // tapered main branch
  const steps = 60
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const px = x0 + (x1 - x0) * t
    const py = y0 + (y1 - y0) * t + Math.sin(t * 6) * 1.2
    const wd = 5 - t * 3
    fillCircle(c, px, py, wd / 2, PAL.trunk)
    c.set(px, py - wd * 0.4, PAL.trunkLight)
    c.set(px, py + wd * 0.4, PAL.trunkDark)
  }
  // twigs
  const twigs = randInt(rng, 3, 4)
  for (let i = 0; i < twigs; i++) {
    const t = 0.25 + rng() * 0.6
    const px = x0 + (x1 - x0) * t
    const py = y0 + (y1 - y0) * t + Math.sin(t * 6) * 1.2
    const dir = rng() > 0.5 ? -1 : 1
    const len = 5 + rng() * 7
    const ang = dir * (0.5 + rng() * 0.7) + (y1 - y0 > 0 ? -0.5 : 0.5)
    const tx = px + Math.cos(ang) * len
    const ty = py + Math.sin(ang) * len
    const stepsT = 20
    for (let k = 0; k <= stepsT; k++) {
      const tt = k / stepsT
      fillCircle(c, px + (tx - px) * tt, py + (ty - py) * tt, (2.4 - tt * 1.8) / 1.6, PAL.trunk)
    }
    if (rng() > 0.5) fillEllipse(c, tx, ty, 2, 1.4, hex('#6f8a3f'))
  }
  // knots
  const knots = randInt(rng, 1, 3)
  for (let i = 0; i < knots; i++) {
    const t = 0.2 + rng() * 0.6
    const px = x0 + (x1 - x0) * t
    const py = y0 + (y1 - y0) * t + Math.sin(t * 6) * 1.2
    fillEllipse(c, px, py, 2.2, 1.8, PAL.trunkDark)
    fillEllipse(c, px - 0.5, py - 0.5, 1.1, 0.9, hex('#8a6a44'))
  }
  outline(c, hex('#2a1f12'))
}

function drawNest(c, rng) {
  const w = c.w
  const h = c.h
  const cx = w / 2
  const cy = h * 0.62
  const rx = w * 0.47
  const ry = h * 0.4
  // outer bowl
  fillEllipse(c, cx, cy, rx, ry, hex('#7a5a34'))
  fillEllipse(c, cx + rx * 0.2, cy + ry * 0.25, rx * 0.8, ry * 0.7, hex('#54401f'), true)
  fillEllipse(c, cx - rx * 0.3, cy - ry * 0.35, rx * 0.5, ry * 0.4, hex('#9a7546'), true)
  // woven twigs — short arcs wrapping the bowl
  const weaves = 26
  for (let i = 0; i < weaves; i++) {
    const a0 = rng() * Math.PI * 2
    const rr = 0.5 + rng() * 0.5
    const sx = cx + Math.cos(a0) * rx * rr
    const sy = cy + Math.sin(a0) * ry * rr
    const len = 4 + rng() * 7
    const ang = a0 + Math.PI / 2 + (rng() - 0.5) * 0.8
    drawLine(
      c,
      sx,
      sy,
      sx + Math.cos(ang) * len,
      sy + Math.sin(ang) * len,
      [hex('#8a6738'), hex('#5d4526'), hex('#a58252'), hex('#6b512e')][i % 4],
      1,
    )
  }
  // inner hollow with a few eggs
  fillEllipse(c, cx, cy - ry * 0.05, rx * 0.55, ry * 0.42, hex('#3d2e18'))
  const eggs = randInt(rng, 2, 3)
  for (let i = 0; i < eggs; i++) {
    const ex = cx + (i - (eggs - 1) / 2) * 4 + (rng() - 0.5) * 2
    const ey = cy - ry * 0.05 + (rng() - 0.5) * 2
    fillEllipse(c, ex, ey, 2.2, 1.8, hex('#dfe3d4'))
    fillEllipse(c, ex - 0.5, ey - 0.5, 1.2, 1, hex('#f2f4ea'))
  }
  // stray twigs poking out of the rim
  const strays = randInt(rng, 3, 6)
  for (let i = 0; i < strays; i++) {
    const a = -Math.PI + rng() * Math.PI
    const sx = cx + Math.cos(a) * rx * 0.95
    const sy = cy + Math.sin(a) * ry * 0.95
    drawLine(c, sx, sy, sx + Math.cos(a) * (3 + rng() * 5), sy + Math.sin(a) * (3 + rng() * 5), hex('#5d4526'), 1)
  }
  outline(c, hex('#241a0d'))
}

function drawLilyPad(c) {
  const w = c.w
  const h = c.h
  const cx = w * 0.48
  const cy = h * 0.5
  const rx = w * 0.47
  const ry = h * 0.46
  fillEllipse(c, cx, cy, rx, ry, hex('#4a7a3a'))
  fillEllipse(c, cx + rx * 0.15, cy + ry * 0.2, rx * 0.85, ry * 0.8, hex('#38602c'), true)
  fillEllipse(c, cx - rx * 0.3, cy - ry * 0.3, rx * 0.55, ry * 0.5, hex('#6fa04f'), true)
  // notch — the classic lily-pad wedge cut
  const notchA = -0.35
  const notchW = 0.5
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!c.opaque(x, y)) continue
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const a = Math.atan2(dy, dx)
      const d = Math.sqrt(dx * dx + dy * dy)
      if (Math.abs(a - notchA) < notchW / 2 && d > rx * 0.12) c.clearAt(x, y)
    }
  }
  // radial veins
  const veins = 7
  for (let i = 0; i < veins; i++) {
    const a = -Math.PI + (i / (veins - 1)) * Math.PI * 2
    if (Math.abs(a - notchA) < notchW) continue
    drawLine(c, cx, cy, cx + Math.cos(a) * rx * 0.92, cy + Math.sin(a) * ry * 0.92, alpha(hex('#2f5223'), 200), 1)
  }
  // dew highlight
  fillEllipse(c, cx - rx * 0.35, cy - ry * 0.3, 3, 2.4, alpha(hex('#cfe3d2'), 210))
  outline(c, hex('#1e3a18'))
}

function drawFallenTree(c, rng) {
  const w = c.w
  const h = c.h
  const cy = h * 0.55
  const ry = h * 0.3
  const r = ry
  const leftX = w * 0.14
  const rightX = w - r - 1

  // root plate — a fan of torn roots at the left end
  const roots = 5
  for (let i = 0; i < roots; i++) {
    const t = i / (roots - 1)
    const ang = -Math.PI * 0.75 + t * Math.PI * 1.5
    const len = 8 + rng() * 9
    const pts = [
      [leftX, cy - 3],
      [leftX + Math.cos(ang) * len, cy + Math.sin(ang) * len],
      [leftX + Math.cos(ang + 0.5) * len * 0.7, cy + Math.sin(ang + 0.5) * len * 0.7],
      [leftX, cy + 4],
    ]
    fillPoly(c, pts, i % 2 === 0 ? PAL.trunk : shade(PAL.trunk, 0.85))
  }

  // trunk capsule
  fillEllipse(c, leftX + r, cy, r, ry, PAL.trunk)
  fillRect(c, leftX + r, cy - ry, rightX - leftX - r, ry * 2, PAL.trunk)
  fillEllipse(c, rightX, cy, r, ry, PAL.trunk)
  // grain
  for (let i = 0; i < 9; i++) {
    const yy = cy - ry + 1 + rng() * (ry * 2 - 2)
    drawLine(
      c,
      leftX + r * 0.5,
      yy,
      rightX - rng() * 6,
      yy + (rng() - 0.5) * 3,
      rng() > 0.5 ? alpha(PAL.trunkDark, 165) : alpha(hex('#87643a'), 150),
      1,
    )
  }
  fillEllipse(c, (leftX + rightX) / 2, cy - ry * 0.55, (rightX - leftX) * 0.42, ry * 0.32, alpha(PAL.trunkLight, 130), true)

  // broken branch stubs on top
  const stubs = randInt(rng, 2, 3)
  for (let i = 0; i < stubs; i++) {
    const sx = leftX + r + 6 + rng() * (rightX - leftX - r - 14)
    const up = rng() > 0.4
    const len = 5 + rng() * 6
    const ang = up ? -Math.PI / 2 + (rng() - 0.5) * 0.8 : Math.PI / 2 - (rng() - 0.5) * 0.8
    const tx = sx + Math.cos(ang) * len
    const ty = cy + Math.sin(ang) * len * (up ? 1 : 0.8)
    drawLine(c, sx, cy, tx, ty, PAL.trunk, 3)
    fillEllipse(c, tx, ty, 1.6, 1.4, hex('#c9a169'))
  }

  // end grain on the right
  fillEllipse(c, rightX + 1, cy, r - 1, ry - 1, hex('#b08d5c'))
  fillEllipse(c, rightX + 1, cy, (r - 1) * 0.62, (ry - 1) * 0.62, hex('#9c7a4c'))
  fillEllipse(c, rightX + 1, cy, (r - 1) * 0.3, (ry - 1) * 0.3, hex('#b08d5c'))
  fillEllipse(c, rightX + 1, cy, (r - 1) * 0.12, (ry - 1) * 0.12, hex('#8a6a3e'))

  // moss along the top
  const mossX = leftX + r + 4
  const mossW = rightX - mossX - 8
  fillEllipse(c, mossX + mossW * 0.35, cy - ry * 0.8, mossW * 0.3, ry * 0.35, alpha(PAL.moss500, 230))
  fillEllipse(c, mossX + mossW * 0.3, cy - ry * 0.9, mossW * 0.18, ry * 0.25, alpha(PAL.moss400, 230))
  speckle(c, rng, 0.05, alpha(PAL.moss600, 220))

  outline(c, hex('#2a1f12'))
}

const ENVIRONMENT_DRAWERS = {
  rock_small: (c, rng) => drawRockProp(c, rng),
  rock_large: (c, rng) => drawRockProp(c, rng),
  log: (c, rng) => drawLog(c, rng),
  branch: (c, rng) => drawBranch(c, rng),
  nest: (c, rng) => drawNest(c, rng),
  lily_pad: (c) => drawLilyPad(c),
  fallen_tree: (c, rng) => drawFallenTree(c, rng),
}

// ---------------------------------------------------------------------------
// animal spritesheets — rows = state x direction, columns = frames
// direction order: 0 = up (back view), 1 = right, 2 = down (front view), 3 = left
// ---------------------------------------------------------------------------

const ANIMAL_SPECS = {
  deer: {
    plan: 'quadruped',
    frame: 48,
    directions: 4,
    states: [['idle', 4], ['walk', 4], ['eat', 4], ['flee', 4]],
    body: hex('#9c7646'),
    belly: hex('#ddcaa4'),
    dark: hex('#6b5232'),
    eye: hex('#17120a'),
    outline: hex('#2a1f12'),
    bodyRx: 0.3,
    bodyRy: 0.16,
    legLen: 0.3,
    legW: 3,
    headR: 0.13,
    headYFactor: 1.0,
    muzzle: 'long',
    ears: 'deer',
    antlers: true,
    tail: 'flag',
    gait: { idle: 0, walk: 0.07, eat: 0, flee: 0.13 },
  },
  rabbit: {
    plan: 'quadruped',
    frame: 32,
    directions: 4,
    states: [['idle', 4], ['hop', 4], ['flee', 4]],
    body: hex('#9b8574'),
    belly: hex('#eadfd2'),
    dark: hex('#6e5c4e'),
    eye: hex('#17120a'),
    outline: hex('#2a1f12'),
    bodyRx: 0.3,
    bodyRy: 0.19,
    legLen: 0.15,
    legW: 2,
    headR: 0.16,
    headYFactor: 0.4,
    muzzle: 'short',
    ears: 'long',
    antlers: false,
    tail: 'puff',
    gait: { idle: 0, hop: 0.05, flee: 0.12 },
  },
  squirrel: {
    plan: 'quadruped',
    frame: 32,
    directions: 4,
    states: [['idle', 4], ['walk', 4]],
    body: hex('#a86a3a'),
    belly: hex('#ecd9b8'),
    dark: hex('#74471f'),
    eye: hex('#17120a'),
    outline: hex('#2a1f12'),
    bodyRx: 0.27,
    bodyRy: 0.19,
    legLen: 0.16,
    legW: 2,
    headR: 0.15,
    headYFactor: 0.7,
    muzzle: 'short',
    ears: 'tuft',
    antlers: false,
    tail: 'arched',
    gait: { idle: 0, walk: 0.07 },
  },
  wolf: {
    plan: 'quadruped',
    frame: 44,
    directions: 4,
    states: [['idle', 4], ['walk', 4], ['run', 4]],
    body: hex('#7d8188'),
    belly: hex('#c6cad0'),
    dark: hex('#54585f'),
    eye: hex('#d9a441'),
    outline: hex('#1d2024'),
    bodyRx: 0.31,
    bodyRy: 0.16,
    legLen: 0.28,
    legW: 3,
    headR: 0.14,
    headYFactor: 0.95,
    muzzle: 'long',
    ears: 'pointed',
    antlers: false,
    tail: 'bushy',
    gait: { idle: 0, walk: 0.07, run: 0.14 },
  },
  fox: {
    plan: 'quadruped',
    frame: 40,
    directions: 4,
    states: [['idle', 4], ['walk', 4], ['run', 4]],
    body: hex('#c1622f'),
    belly: hex('#f2e6d6'),
    dark: hex('#8f431d'),
    eye: hex('#17120a'),
    outline: hex('#33160a'),
    bodyRx: 0.3,
    bodyRy: 0.16,
    legLen: 0.26,
    legW: 3,
    headR: 0.14,
    headYFactor: 0.95,
    muzzle: 'long',
    ears: 'pointed',
    antlers: false,
    tail: 'brush',
    gait: { idle: 0, walk: 0.07, run: 0.13 },
  },
  eagle: {
    plan: 'bird',
    frame: 56,
    directions: 4,
    states: [['perch', 4], ['fly', 4]],
    body: hex('#5b4a34'),
    belly: hex('#e8e3d5'),
    dark: hex('#3d3122'),
    accent: hex('#f2efe6'),
    beak: hex('#d9a441'),
    eye: hex('#17120a'),
    outline: hex('#1c1610'),
    gait: { perch: 0, fly: 1 },
  },
  songbird: {
    plan: 'bird',
    frame: 26,
    directions: 4,
    states: [['perch', 4], ['fly', 4]],
    body: hex('#5a7d94'),
    belly: hex('#e6d9b6'),
    dark: hex('#3c5768'),
    accent: hex('#8fb0c4'),
    beak: hex('#d9a441'),
    eye: hex('#17120a'),
    outline: hex('#16222b'),
    gait: { perch: 0, fly: 1 },
  },
  fish: {
    plan: 'fish',
    frame: 34,
    directions: 1,
    states: [['swim', 4]],
    body: hex('#6fa8b8'),
    belly: hex('#cfe4e8'),
    dark: hex('#3f7789'),
    accent: hex('#2e5f7a'),
    eye: hex('#17120a'),
    outline: hex('#12303c'),
  },
}

const SWING_WALK = [1, 0, -1, 0]
const SWING_RUN = [1, -1, 1, -1]
const HEAD_BOB = [0, -0.3, 0, 0.3]
const EAT_T = [0.3, 0.75, 0.95, 0.65]
const HOP_DY = [0.12, -0.1, -0.1, 0.12]
const WING_TIP = [-0.42, -0.12, 0.18, -0.12]

function legStroke(c, x, topY, botY, w, col, hoofCol) {
  const half = w / 2
  const height = botY - topY
  if (height <= 0) return
  fillRect(c, x - half, topY, w, height, col)
  for (let y = topY; y < botY - 1; y++) c.set(x - half, y, lighten(col, 0.28))
  fillRect(c, x - half, botY - Math.min(2, height), w, Math.min(2, height), hoofCol)
}

function bodyMass(c, cx, cy, rx, ry, spec, rng, bellyBoost = 1) {
  fillEllipse(c, cx, cy, rx, ry, spec.body)
  fillEllipse(c, cx + rx * 0.2, cy + ry * 0.3, rx * 0.88, ry * 0.8, spec.dark, true)
  fillEllipse(c, cx - rx * 0.25, cy - ry * 0.32, rx * 0.6, ry * 0.55, lighten(spec.body, 0.22), true)
  fillEllipse(c, cx + rx * 0.05, cy + ry * (0.55 * bellyBoost), rx * 0.66, ry * (0.36 * bellyBoost), spec.belly, true)
  if (rng) speckle(c, rng, 0.05, alpha(spec.dark, 150))
}

/** ears seen from the side; anchor at head centre */
function earsSide(c, spec, hx, hy, headR) {
  const inner = spec.belly
  if (spec.ears === 'deer') {
    fillEllipse(c, hx - headR * 0.55, hy - headR * 0.8, headR * 0.5, headR * 0.3, spec.dark)
    fillEllipse(c, hx - headR * 0.55, hy - headR * 0.8, headR * 0.3, headR * 0.16, inner)
    fillEllipse(c, hx + headR * 0.2, hy - headR * 1.0, headR * 0.48, headR * 0.3, spec.body)
    fillEllipse(c, hx + headR * 0.2, hy - headR * 1.0, headR * 0.26, headR * 0.15, inner)
  } else if (spec.ears === 'pointed') {
    fillPoly(c, [
      [hx - headR * 0.9, hy - headR * 0.3],
      [hx - headR * 0.35, hy - headR * 1.5],
      [hx - headR * 0.05, hy - headR * 0.35],
    ], spec.dark)
    fillPoly(c, [
      [hx - headR * 0.1, hy - headR * 0.45],
      [hx + headR * 0.45, hy - headR * 1.6],
      [hx + headR * 0.7, hy - headR * 0.4],
    ], spec.body)
    fillPoly(c, [
      [hx + headR * 0.1, hy - headR * 0.5],
      [hx + headR * 0.42, hy - headR * 1.25],
      [hx + headR * 0.55, hy - headR * 0.45],
    ], inner)
  } else if (spec.ears === 'long') {
    fillEllipse(c, hx - headR * 0.45, hy - headR * 1.35, headR * 0.34, headR * 1.0, spec.dark)
    fillEllipse(c, hx + headR * 0.3, hy - headR * 1.4, headR * 0.34, headR * 1.05, spec.body)
    fillEllipse(c, hx + headR * 0.3, hy - headR * 1.4, headR * 0.16, headR * 0.75, inner)
  } else if (spec.ears === 'tuft') {
    fillEllipse(c, hx - headR * 0.5, hy - headR * 0.9, headR * 0.35, headR * 0.4, spec.dark)
    fillEllipse(c, hx + headR * 0.3, hy - headR * 1.0, headR * 0.35, headR * 0.4, spec.body)
    c.set(hx + headR * 0.45, hy - headR * 1.5, spec.dark)
    c.set(hx + headR * 0.45, hy - headR * 1.4, spec.dark)
    c.set(hx - headR * 0.6, hy - headR * 1.35, spec.dark)
  }
}

/** ears seen from front/back (symmetric pair) */
function earsVertical(c, spec, hx, hy, headR) {
  const inner = spec.belly
  const common = (side) => {
    const ex = hx + side * headR * 0.55
    if (spec.ears === 'deer') {
      fillEllipse(c, ex, hy - headR * 0.9, headR * 0.45, headR * 0.28, side < 0 ? spec.dark : spec.body)
      fillEllipse(c, ex, hy - headR * 0.9, headR * 0.24, headR * 0.15, inner)
    } else if (spec.ears === 'pointed') {
      fillPoly(c, [
        [ex - headR * 0.4, hy - headR * 0.3],
        [ex, hy - headR * 1.6],
        [ex + headR * 0.4, hy - headR * 0.3],
      ], side < 0 ? spec.dark : spec.body)
      fillPoly(c, [
        [ex - headR * 0.18, hy - headR * 0.45],
        [ex, hy - headR * 1.2],
        [ex + headR * 0.18, hy - headR * 0.45],
      ], inner)
    } else if (spec.ears === 'long') {
      fillEllipse(c, ex, hy - headR * 1.3, headR * 0.3, headR * 1.0, side < 0 ? spec.dark : spec.body)
      fillEllipse(c, ex, hy - headR * 1.3, headR * 0.13, headR * 0.7, inner)
    } else if (spec.ears === 'tuft') {
      fillEllipse(c, ex, hy - headR * 0.9, headR * 0.3, headR * 0.38, side < 0 ? spec.dark : spec.body)
      c.set(ex, hy - headR * 1.35, spec.dark)
    }
  }
  common(-1)
  common(1)
}

function tailSide(c, spec, bx, by, frame, lift = 0) {
  const F = spec.frame
  if (spec.tail === 'flag') {
    fillEllipse(c, bx - F * 0.05, by + F * 0.02 - lift, F * 0.08, F * 0.06, spec.dark)
    fillEllipse(c, bx - F * 0.1, by - lift, F * 0.07, F * 0.05, spec.belly)
  } else if (spec.tail === 'puff') {
    fillCircle(c, bx - F * 0.06, by - lift, F * 0.07, spec.belly)
    fillCircle(c, bx - F * 0.07, by - 1 - lift, F * 0.045, lighten(spec.belly, 0.3))
  } else if (spec.tail === 'bushy') {
    drawCurve(c, bx, by, bx - F * 0.2, by + F * 0.05, bx - F * 0.16, by + F * 0.22 - lift,
      spec.dark, (t) => F * (0.1 - t * 0.045))
    fillEllipse(c, bx - F * 0.15, by + F * 0.2 - lift, F * 0.06, F * 0.05, spec.belly)
  } else if (spec.tail === 'brush') {
    drawCurve(c, bx, by, bx - F * 0.24, by - F * 0.02, bx - F * 0.2, by + F * 0.14 - lift,
      spec.body, (t) => F * (0.13 - t * 0.05))
    fillEllipse(c, bx - F * 0.21, by + F * 0.16 - lift, F * 0.07, F * 0.055, spec.belly)
    fillEllipse(c, bx - F * 0.24, by + F * 0.1 - lift, F * 0.09, F * 0.07, lighten(spec.body, 0.15))
  } else if (spec.tail === 'arched') {
    drawCurve(c, bx, by + F * 0.05, bx - F * 0.28, by - F * 0.22, bx + F * 0.02, by - F * 0.3,
      spec.body, (t) => F * (0.16 - t * 0.05))
    fillEllipse(c, bx + F * 0.05, by - F * 0.28, F * 0.07, F * 0.06, lighten(spec.body, 0.25))
    fillEllipse(c, bx - F * 0.16, by - F * 0.2, F * 0.1, F * 0.09, spec.belly)
  }
}

function antlersSide(c, hx, hy, headR) {
  const col = hex('#8a7550')
  const grow = (x, y, ang, len, depth) => {
    const x2 = x + Math.cos(ang) * len
    const y2 = y + Math.sin(ang) * len
    drawLine(c, x, y, x2, y2, col, depth > 1 ? 2 : 1)
    if (depth <= 0) return
    grow(x2, y2, ang - 0.5, len * 0.55, depth - 1)
    grow(x2, y2, ang + 0.45, len * 0.5, depth - 1)
    grow(x + (x2 - x) * 0.55, y + (y2 - y) * 0.55, ang - 0.9, len * 0.45, depth - 1)
  }
  grow(hx - headR * 0.3, hy - headR * 0.85, -Math.PI / 2 - 0.35, headR * 1.1, 2)
  grow(hx + headR * 0.35, hy - headR * 0.9, -Math.PI / 2 + 0.3, headR * 1.1, 2)
}

function headSide(c, spec, hx, hy, headR, opts) {
  const { eat = 0, bob = 0, rng = null } = opts
  const y = hy + bob + eat * spec.frame * 0.3
  const x = hx + eat * spec.frame * 0.16
  fillCircle(c, x, y, headR, spec.body)
  if (eat > 0) fillEllipse(c, x + headR * 0.4, y + headR * 0.5, headR * 0.9, headR * 0.7, spec.dark, true)
  fillEllipse(c, x - headR * 0.3, y - headR * 0.3, headR * 0.65, headR * 0.6, lighten(spec.body, 0.25), true)
  // muzzle
  if (spec.muzzle === 'long') {
    const mx = x + headR * 0.9
    const my = y + headR * 0.45 + eat * headR * 0.5
    fillEllipse(c, mx, my, headR * 0.75, headR * 0.45, spec.body)
    fillEllipse(c, mx + headR * 0.45, my - headR * 0.1, headR * 0.3, headR * 0.25, spec.dark)
    c.set(mx + headR * 0.7, my - headR * 0.1, hex('#241a12'))
  } else {
    fillEllipse(c, x + headR * 0.5, y + headR * 0.4, headR * 0.5, headR * 0.4, spec.belly)
    c.set(x + headR * 0.8, y + headR * 0.35, hex('#241a12'))
  }
  // eye
  c.set(x + headR * 0.3, y - headR * 0.15, spec.eye)
  if (headR > 5) c.set(x + headR * 0.3, y - headR * 0.3, lighten(spec.eye, 0.9))
  earsSide(c, spec, x, y, headR)
  if (spec.antlers) antlersSide(c, x, y, headR)
  if (rng) speckle(c, rng, 0.04, alpha(spec.dark, 120))
  return [x, y]
}

function quadrupedSide(canvas, spec, state, frame, rng) {
  const F = spec.frame
  const tmp = new Canvas(F, F)
  const groundY = F - 5
  const stride = (spec.gait[state] ?? 0) * F
  const swing =
    state === 'walk' ? SWING_WALK[frame] : state === 'eat' ? 0 : SWING_RUN[frame] * (stride > 0 ? 1 : 0)
  const hop = state === 'hop' ? HOP_DY[frame] * F : 0
  const bob = (state === 'idle' || state === 'walk' ? HEAD_BOB[frame] : 0) * (F * 0.02)
  const eat = state === 'eat' ? EAT_T[frame] : 0
  const lean = state === 'flee' || state === 'run' ? F * 0.05 : 0

  const bodyRx = spec.bodyRx * F
  const bodyRy = spec.bodyRy * F
  const legLen = spec.legLen * F
  const bodyCx = F * 0.46 + lean
  const bodyCy = groundY - legLen - bodyRy + hop
  const hoof = hex('#2b2118')

  // far-side legs first (darker)
  const far = shade(spec.dark, 0.85)
  const nearFrontX = bodyCx + bodyRx * 0.62
  const nearBackX = bodyCx - bodyRx * 0.62
  const farFrontX = nearFrontX - F * 0.07
  const farBackX = nearBackX - F * 0.07
  const tuck = state === 'hop' && frame > 0 && frame < 3 ? legLen * 0.4 : 0
  legStroke(tmp, farFrontX + swing * stride, bodyCy + bodyRy * 0.4, groundY - tuck, spec.legW, far, hoof)
  legStroke(tmp, farBackX - swing * stride, bodyCy + bodyRy * 0.4, groundY - tuck, spec.legW, far, hoof)

  tailSide(tmp, spec, bodyCx - bodyRx * 0.9, bodyCy - bodyRy * 0.2 + hop,
    frame, state === 'flee' || state === 'run' ? F * 0.1 : 0)

  bodyMass(tmp, bodyCx, bodyCy, bodyRx, bodyRy, spec, rng)
  // haunch + shoulder hints
  fillEllipse(tmp, nearBackX, bodyCy + bodyRy * 0.25, bodyRx * 0.42, bodyRy * 0.7, alpha(spec.dark, 110), true)
  fillEllipse(tmp, nearFrontX, bodyCy - bodyRy * 0.1, bodyRx * 0.3, bodyRy * 0.55, alpha(lighten(spec.body, 0.18), 130), true)

  // near-side legs
  legStroke(tmp, nearFrontX - swing * stride, bodyCy + bodyRy * 0.35, groundY - tuck, spec.legW, spec.body, hoof)
  legStroke(tmp, nearBackX + swing * stride, bodyCy + bodyRy * 0.35, groundY - tuck, spec.legW, spec.body, hoof)

  // neck + head
  const headR = spec.headR * F
  const hy0 = bodyCy - bodyRy * spec.headYFactor
  const hx0 = bodyCx + bodyRx * (spec.muzzle === 'long' ? 0.85 : 0.7)
  if (spec.headYFactor > 0.6) {
    drawLine(tmp, bodyCx + bodyRx * 0.45, bodyCy - bodyRy * 0.5, hx0, hy0 + headR * 0.6, spec.body, headR * 1.15)
    drawLine(tmp, bodyCx + bodyRx * 0.45, bodyCy - bodyRy * 0.5, hx0 - 1, hy0 + headR * 0.6, alpha(spec.dark, 120), headR * 0.4)
  }
  headSide(tmp, spec, hx0, hy0, headR, { eat, bob, rng })

  blit(tmp, canvas, 0, 0)
  return tmp
}

function quadrupedVertical(canvas, spec, state, frame, rng, front) {
  const F = spec.frame
  const tmp = new Canvas(F, F)
  const groundY = F - 5
  const stride = (spec.gait[state] ?? 0) * F
  const swing = state === 'walk' ? SWING_WALK[frame] : (stride > 0 ? SWING_RUN[frame] : 0)
  const hop = state === 'hop' ? HOP_DY[frame] * F : 0
  const eat = state === 'eat' ? EAT_T[frame] * 0.4 : 0

  const bodyRx = spec.bodyRx * F * (front ? 0.85 : 0.8)
  const bodyRy = spec.bodyRy * F * (front ? 1.35 : 1.3)
  const bodyCy = (front ? F * 0.56 : F * 0.58) + hop
  const hoof = hex('#2b2118')
  const headR = spec.headR * F * (front ? 1.05 : 0.95)
  const hy = F * (front ? 0.27 : 0.29) + hop + eat * F * 0.1
  const hx = F / 2

  // rear legs peeking outside the body
  const legTop = bodyCy + bodyRy * 0.5
  legStroke(tmp, F / 2 - bodyRx * 1.15 - swing * stride * 0.5, legTop, groundY, spec.legW, shade(spec.dark, 0.85), hoof)
  legStroke(tmp, F / 2 + bodyRx * 1.15 + swing * stride * 0.5, legTop, groundY, spec.legW, shade(spec.dark, 0.85), hoof)

  // tail (back view only)
  if (!front && spec.tail) {
    tailSide(tmp, spec, F / 2 - bodyRx * 0.2, bodyCy + bodyRy * 0.7, frame, 0)
    if (spec.tail === 'puff' || spec.tail === 'flag') {
      fillCircle(tmp, F / 2, bodyCy + bodyRy * 0.9, F * 0.06, spec.belly)
    }
  }

  bodyMass(tmp, F / 2, bodyCy, bodyRx, bodyRy, spec, rng, front ? 1.2 : 0.7)

  // front legs
  const nearSwing = state === 'walk' ? swing : swing
  legStroke(tmp, F / 2 - bodyRx * 0.45 - nearSwing * stride, legTop + 2, groundY, spec.legW, spec.body, hoof)
  legStroke(tmp, F / 2 + bodyRx * 0.45 + nearSwing * stride, legTop + 2, groundY, spec.legW, spec.body, hoof)

  // head
  fillCircle(tmp, hx, hy, headR, spec.body)
  fillEllipse(tmp, hx - headR * 0.3, hy - headR * 0.3, headR * 0.6, headR * 0.55, lighten(spec.body, 0.25), true)
  fillEllipse(tmp, hx, hy + headR * 0.45, headR * 0.7, headR * 0.5, spec.belly, true)
  if (front) {
    // face: eyes + muzzle + nose
    c2set(tmp, hx - headR * 0.4, hy - headR * 0.1, spec.eye)
    c2set(tmp, hx + headR * 0.4, hy - headR * 0.1, spec.eye)
    if (headR > 5) {
      c2set(tmp, hx - headR * 0.4, hy - headR * 0.25, lighten(spec.eye, 0.85))
      c2set(tmp, hx + headR * 0.4, hy - headR * 0.25, lighten(spec.eye, 0.85))
    }
    fillEllipse(tmp, hx, hy + headR * 0.45, headR * 0.42, headR * 0.3, spec.belly)
    c2set(tmp, hx, hy + headR * 0.4, hex('#241a12'))
    earsVertical(tmp, spec, hx, hy, headR)
    if (spec.antlers) antlersVertical(tmp, hx, hy, headR)
  } else {
    // back of the head — no face, just ears (+ antlers still visible)
    fillEllipse(tmp, hx + headR * 0.2, hy + headR * 0.3, headR * 0.8, headR * 0.7, spec.dark, true)
    earsVertical(tmp, spec, hx, hy, headR)
    if (spec.antlers) antlersVertical(tmp, hx, hy, headR)
  }
  blit(tmp, canvas, 0, 0)
  return tmp
}

function antlersVertical(c, hx, hy, headR) {
  const col = hex('#8a7550')
  for (const side of [-1, 1]) {
    drawLine(c, hx + side * headR * 0.5, hy - headR * 0.8, hx + side * headR * 1.1, hy - headR * 1.9, col, 2)
    drawLine(c, hx + side * headR * 1.1, hy - headR * 1.9, hx + side * headR * 1.7, hy - headR * 2.3, col, 1)
    drawLine(c, hx + side * headR * 1.1, hy - headR * 1.9, hx + side * headR * 0.8, hy - headR * 2.5, col, 1)
  }
}

/** single setPixel that reads nicer in the vertical-face code above */
function c2set(c, x, y, col) {
  c.set(x, y, col)
}

// ---- birds (eagle, songbird) ------------------------------------------------

function birdWingSide(c, sx, sy, F, tipDy, dark) {
  const pts = [
    [sx, sy],
    [sx - F * 0.2, sy + tipDy * 0.55 - F * 0.06],
    [sx - F * 0.46, sy + tipDy],
    [sx - F * 0.4, sy + tipDy + F * 0.11],
    [sx - F * 0.12, sy + F * 0.2],
  ]
  fillPoly(c, pts, dark)
  fillPoly(
    c,
    pts.map(([px, py]) => [px, py - F * 0.03]),
    lighten(dark, 0.18),
    true,
  )
}

function birdWingSpread(c, side, sx, sy, F, tipDy, col, dark) {
  const pts = [
    [sx, sy - F * 0.04],
    [sx + side * F * 0.3, sy + tipDy * 0.7 - F * 0.05],
    [sx + side * F * 0.47, sy + tipDy],
    [sx + side * F * 0.42, sy + tipDy + F * 0.1],
    [sx + side * F * 0.16, sy + F * 0.14],
  ]
  fillPoly(c, pts, col)
  // feather banding
  for (let i = 1; i <= 3; i++) {
    const t = i / 4
    const x0 = sx + side * F * 0.44 * t
    const y0 = sy + tipDy * t - F * 0.02
    drawLine(c, x0, y0, x0 + side * F * 0.04, y0 + F * 0.12, alpha(dark, 190), 1)
  }
  fillPoly(
    c,
    pts.map(([px, py]) => [px, py - F * 0.025]),
    lighten(col, 0.16),
    true,
  )
}

function birdTailFan(c, cx, cy, F, col, dark, spread = 1) {
  fillPoly(c, [
    [cx - F * 0.1 * spread, cy],
    [cx + F * 0.1 * spread, cy],
    [cx + F * 0.16 * spread, cy + F * 0.22],
    [cx, cy + F * 0.17],
    [cx - F * 0.16 * spread, cy + F * 0.22],
  ], col)
  drawLine(c, cx - F * 0.08, cy + F * 0.02, cx - F * 0.12, cy + F * 0.18, dark, 1)
  drawLine(c, cx + F * 0.08, cy + F * 0.02, cx + F * 0.12, cy + F * 0.18, dark, 1)
}

function birdHead(c, spec, hx, hy, headR, F, front, beakSide = 1) {
  fillCircle(c, hx, hy, headR, spec.body)
  fillEllipse(c, hx - headR * 0.3, hy - headR * 0.3, headR * 0.6, headR * 0.55, lighten(spec.body, 0.3), true)
  fillEllipse(c, hx, hy + headR * 0.4, headR * 0.7, headR * 0.45, spec.belly, true)
  if (front) {
    c2set(c, hx - headR * 0.4, hy - headR * 0.1, spec.eye)
    c2set(c, hx + headR * 0.4, hy - headR * 0.1, spec.eye)
    // beak pointing toward the viewer (down)
    fillPoly(c, [
      [hx - headR * 0.3, hy + headR * 0.35],
      [hx + headR * 0.3, hy + headR * 0.35],
      [hx, hy + headR * 1.25],
    ], spec.beak)
    c2set(c, hx, hy + headR * 0.8, shade(spec.beak, 0.7))
  } else {
    const dir = beakSide
    const bl = headR * (spec.accent && headR > 6 ? 1.05 : 0.85)
    fillPoly(c, [
      [hx + dir * headR * 0.45, hy - headR * 0.3],
      [hx + dir * (headR + bl), hy + headR * 0.12],
      [hx + dir * headR * 0.45, hy + headR * 0.5],
    ], spec.beak)
    // hooked tip (eagle)
    if (headR > 6) {
      fillPoly(c, [
        [hx + dir * (headR + bl * 0.55), hy + headR * 0.08],
        [hx + dir * (headR + bl), hy + headR * 0.12],
        [hx + dir * (headR + bl * 0.7), hy + headR * 0.42],
      ], shade(spec.beak, 0.75))
    }
    c2set(c, hx + dir * headR * 0.2, hy - headR * 0.2, spec.eye)
    if (headR > 5) c2set(c, hx + dir * headR * 0.2, hy - headR * 0.35, lighten(spec.eye, 0.9))
  }
}

function birdSide(canvas, spec, state, frame, rng) {
  const F = spec.frame
  const tmp = new Canvas(F, F)
  const fly = state === 'fly'
  const groundY = F - 4
  const bodyRx = F * 0.3
  const bodyRy = F * 0.24
  const bodyCx = F * 0.47
  const legLen = F * 0.13
  const bodyCy = fly ? F * 0.47 : groundY - legLen - bodyRy
  const headR = F * 0.15
  const hx = bodyCx + bodyRx * 0.7
  const hy = bodyCy - bodyRy * 0.95 + (state === 'perch' ? HEAD_BOB[frame] * F * 0.02 : 0)
  const tipDy = WING_TIP[frame] * F

  // far wing behind the body when flying
  if (fly) birdWingSide(tmp, bodyCx - bodyRx * 0.15, bodyCy - bodyRy * 0.1, F, tipDy * 0.8, shade(spec.dark, 0.85))
  // tail
  birdTailFan(tmp, bodyCx - bodyRx * 0.85, bodyCy - bodyRy * 0.1, F * 1.1, spec.accent ?? spec.body, spec.dark)
  // legs when perched
  if (!fly) {
    const hoof = hex('#3a3128')
    legStroke(tmp, bodyCx + bodyRx * 0.2, bodyCy + bodyRy * 0.7, groundY, Math.max(2, F * 0.05), shade(spec.beak, 0.8), hoof)
    legStroke(tmp, bodyCx - bodyRx * 0.3, bodyCy + bodyRy * 0.7, groundY, Math.max(2, F * 0.05), shade(spec.beak, 0.9), hoof)
  }

  bodyMass(tmp, bodyCx, bodyCy, bodyRx, bodyRy, spec, rng)

  if (fly) {
    birdWingSide(tmp, bodyCx + bodyRx * 0.2, bodyCy - bodyRy * 0.05, F, tipDy, spec.body)
  } else {
    // folded wing with feather lines
    fillEllipse(tmp, bodyCx - bodyRx * 0.1, bodyCy + bodyRy * 0.1, bodyRx * 0.72, bodyRy * 0.6, spec.dark, true)
    for (let i = 0; i < 3; i++) {
      drawLine(
        tmp,
        bodyCx - bodyRx * 0.5 + i * bodyRx * 0.25,
        bodyCy - bodyRy * 0.1,
        bodyCx - bodyRx * 0.75 + i * bodyRx * 0.25,
        bodyCy + bodyRy * 0.5,
        alpha(spec.outline, 170),
        1,
      )
    }
    fillEllipse(tmp, bodyCx - bodyRx * 0.3, bodyCy - bodyRy * 0.25, bodyRx * 0.35, bodyRy * 0.3, lighten(spec.body, 0.2), true)
  }

  birdHead(tmp, spec, hx, hy, headR, F, false, 1)
  blit(tmp, canvas, 0, 0)
  return tmp
}

function birdVertical(canvas, spec, state, frame, rng, front) {
  const F = spec.frame
  const tmp = new Canvas(F, F)
  const fly = state === 'fly'
  const groundY = F - 4
  const cx = F / 2
  const bodyRx = F * 0.2
  const bodyRy = F * 0.24
  const bodyCy = front ? F * 0.56 : F * 0.54
  const headR = F * 0.14
  const headCy = bodyCy - bodyRy - headR * 0.45
  const tipDy = WING_TIP[frame] * F

  if (fly) {
    birdWingSpread(tmp, -1, cx - bodyRx * 0.6, bodyCy - bodyRy * 0.35, F, tipDy, shade(spec.dark, 0.88), spec.outline)
    birdWingSpread(tmp, 1, cx + bodyRx * 0.6, bodyCy - bodyRy * 0.35, F, tipDy, spec.body, spec.dark)
  } else {
    // folded wings hugging the sides
    fillEllipse(tmp, cx - bodyRx * 0.95, bodyCy, bodyRx * 0.3, bodyRy * 0.75, shade(spec.dark, 0.9))
    fillEllipse(tmp, cx + bodyRx * 0.95, bodyCy, bodyRx * 0.3, bodyRy * 0.75, spec.body)
  }

  // tail fan below (mostly visible from the back)
  birdTailFan(tmp, cx, bodyCy + bodyRy * 0.6, F * (front ? 0.9 : 1.2), spec.accent ?? spec.body, spec.dark, front ? 0.8 : 1)

  // legs when perched
  if (!fly) {
    const hoof = hex('#3a3128')
    legStroke(tmp, cx - bodyRx * 0.45, bodyCy + bodyRy * 0.7, groundY, Math.max(2, F * 0.06), shade(spec.beak, 0.85), hoof)
    legStroke(tmp, cx + bodyRx * 0.45, bodyCy + bodyRy * 0.7, groundY, Math.max(2, F * 0.06), shade(spec.beak, 0.85), hoof)
  }

  bodyMass(tmp, cx, bodyCy, bodyRx, bodyRy, spec, rng, front ? 1.2 : 0.7)
  birdHead(tmp, spec, cx, headCy, headR, F, front, 1)
  blit(tmp, canvas, 0, 0)
  return tmp
}

// ---- fish (single direction, top view) -------------------------------------

function fishFrame(canvas, spec, frame) {
  const F = spec.frame
  const tmp = new Canvas(F, F)
  const cy = F * 0.5
  const cx = F * 0.58
  const rx = F * 0.3
  const ry = F * 0.2
  const sway = [2, 0, -2, 0][frame]

  // caudal fin — sways across the frames
  const tailX = cx - rx * 0.9
  fillPoly(tmp, [
    [tailX + 1, cy],
    [tailX - F * 0.22, cy - F * 0.17 + sway],
    [tailX - F * 0.12, cy + sway * 0.5],
    [tailX - F * 0.22, cy + F * 0.17 + sway],
  ], spec.body)
  fillPoly(tmp, [
    [tailX + 1, cy],
    [tailX - F * 0.2, cy - F * 0.15 + sway],
    [tailX - F * 0.1, cy + sway * 0.5],
  ], lighten(spec.body, 0.2), true)

  // pectoral fins
  fillPoly(tmp, [
    [cx + F * 0.04, cy + ry * 0.5],
    [cx - F * 0.1, cy + ry * 1.5 + sway * 0.3],
    [cx + F * 0.14, cy + ry * 0.95],
  ], shade(spec.body, 0.9))
  fillPoly(tmp, [
    [cx + F * 0.04, cy - ry * 0.5],
    [cx - F * 0.1, cy - ry * 1.5 + sway * 0.3],
    [cx + F * 0.14, cy - ry * 0.95],
  ], lighten(spec.body, 0.12))

  // body
  fillEllipse(tmp, cx, cy, rx, ry, spec.body)
  fillEllipse(tmp, cx + rx * 0.1, cy + ry * 0.35, rx * 0.9, ry * 0.7, spec.dark, true)
  fillEllipse(tmp, cx - rx * 0.1, cy - ry * 0.4, rx * 0.7, ry * 0.5, lighten(spec.body, 0.28), true)
  fillEllipse(tmp, cx + rx * 0.1, cy + ry * 0.5, rx * 0.7, ry * 0.4, spec.belly, true)

  // dorsal ridge + stripes (shift slightly with the body sway)
  for (let i = 0; i < 2; i++) {
    const sx = cx - rx * 0.35 + i * rx * 0.5 + sway * 0.4
    fillEllipse(tmp, sx, cy, rx * 0.06, ry * 0.85, alpha(spec.accent, 220))
  }
  fillEllipse(tmp, cx - rx * 0.15, cy - ry * 0.1, rx * 0.5, ry * 0.18, alpha(spec.accent, 130))

  // head details
  const eyeX = cx + rx * 0.55
  c2set(tmp, eyeX, cy - ry * 0.45, spec.eye)
  c2set(tmp, eyeX + 1, cy - ry * 0.45, lighten(spec.eye, 0.85))
  c2set(tmp, eyeX, cy + ry * 0.45, spec.eye)
  drawLine(tmp, cx + rx * 0.9, cy - ry * 0.2, cx + rx * 0.9, cy + ry * 0.2, alpha(spec.outline, 200), 1)
  // gill line
  drawLine(tmp, cx + rx * 0.35, cy - ry * 0.7, cx + rx * 0.2, cy + ry * 0.7, alpha(spec.outline, 150), 1)

  blit(tmp, canvas, 0, 0)
}

// ---- sheet assembly ---------------------------------------------------------

function drawAnimalSheet(canvas, species) {
  const spec = ANIMAL_SPECS[species]
  const F = spec.frame
  const rng = rngFor(`animal:${species}`)

  spec.states.forEach(([stateName, frames], si) => {
    for (let dir = 0; dir < spec.directions; dir++) {
      for (let f = 0; f < frames; f++) {
        const sub = new Canvas(F, F)
        if (spec.plan === 'fish') {
          fishFrame(sub, spec, f)
        } else if (spec.plan === 'bird') {
          if (dir === 1) birdSide(sub, spec, stateName, f, rng)
          else if (dir === 3) {
            const tmp = new Canvas(F, F)
            birdSide(tmp, spec, stateName, f, rng)
            blit(flipX(tmp), sub, 0, 0)
          } else birdVertical(sub, spec, stateName, f, rng, dir === 2)
        } else {
          if (dir === 1) quadrupedSide(sub, spec, stateName, f, rng)
          else if (dir === 3) {
            const tmp = new Canvas(F, F)
            quadrupedSide(tmp, spec, stateName, f, rng)
            blit(flipX(tmp), sub, 0, 0)
          } else quadrupedVertical(sub, spec, stateName, f, rng, dir === 2)
        }
        outline(sub, spec.outline)
        blit(sub, canvas, f * F, (si * spec.directions + dir) * F)
      }
    }
  })
}

// ---------------------------------------------------------------------------
// effects — semi-transparent-friendly shapes; flame is a 4-frame sheet
// ---------------------------------------------------------------------------

function drawRaindrop(c, rng) {
  const cx = (c.w - 1) / 2
  for (let y = 0; y < c.h; y++) {
    const t = y / (c.h - 1)
    const hw = 0.45 + 1.35 * Math.pow(t, 0.75)
    const a = 45 + 205 * t
    for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
      c.set(x, y, alpha(hex('#8fc3dc'), a))
    }
    // bright core near the bulb
    if (t > 0.55) c.set(Math.round(cx), y, alpha(hex('#e8f6fb'), 60 + 140 * t))
  }
  void rng
}

function drawSnowflake(c, rng) {
  const cx = (c.w - 1) / 2
  const cy = (c.h - 1) / 2
  const white = alpha(hex('#f4f9fb'), 245)
  const arm = Math.floor(Math.min(c.w, c.h) / 2)
  for (let i = 1; i <= arm; i++) {
    c.set(cx + i, cy, white)
    c.set(cx - i, cy, white)
    c.set(cx, cy + i, white)
    c.set(cx, cy - i, white)
  }
  for (let i = 1; i <= arm - 1; i++) {
    c.set(cx + i, cy + i, alpha(hex('#dcecf4'), 210))
    c.set(cx - i, cy + i, alpha(hex('#dcecf4'), 210))
    c.set(cx + i, cy - i, alpha(hex('#dcecf4'), 210))
    c.set(cx - i, cy - i, alpha(hex('#dcecf4'), 210))
  }
  c.set(cx, cy, alpha(hex('#ffffff'), 255))
  void rng
}

function drawLeafEffect(c, rng) {
  const w = c.w
  const h = c.h
  const pts = [
    [w * 0.06, h * 0.5],
    [w * 0.3, h * 0.12],
    [w * 0.72, h * 0.2],
    [w * 0.96, h * 0.5],
    [w * 0.7, h * 0.86],
    [w * 0.28, h * 0.82],
  ]
  fillPoly(c, pts, hex('#5f8a3a'))
  fillPoly(
    c,
    pts.map(([px, py]) => [px, py - h * 0.12]),
    hex('#7fae56'),
    true,
  )
  drawLine(c, w * 0.08, h * 0.5, w * 0.94, h * 0.5, alpha(hex('#3c5a26'), 220), 1)
  drawLine(c, w * 0.35, h * 0.5, w * 0.5, h * 0.25, alpha(hex('#3c5a26'), 160), 1)
  drawLine(c, w * 0.55, h * 0.5, w * 0.7, h * 0.75, alpha(hex('#3c5a26'), 160), 1)
  // stem
  drawLine(c, w * 0.02, h * 0.5, w * 0.14, h * 0.48, hex('#6b4f2e'), 1)
  void rng
}

function drawSmokePuff(c, rng) {
  const cx = (c.w - 1) / 2
  const cy = (c.h - 1) / 2
  const R = Math.min(c.w, c.h) * 0.5
  // irregular edge — per-angle radius modulation from the seeded rng
  const lobes = 32
  const edge = new Float32Array(lobes)
  for (let i = 0; i < lobes; i++) edge[i] = 0.82 + rng() * 0.3
  const edgeAt = (angle) => {
    const a = ((angle / (Math.PI * 2)) * lobes + lobes) % lobes
    const i0 = Math.floor(a) % lobes
    const i1 = (i0 + 1) % lobes
    const f = a - Math.floor(a)
    return edge[i0] + (edge[i1] - edge[i0]) * f
  }
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      const ang = Math.atan2(dy, dx)
      const rr = R * edgeAt(ang)
      if (d > rr) continue
      const t = d / rr
      const body = Math.pow(1 - t, 1.6)
      const grain = 0.75 + 0.5 * ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1)
      const a = Math.max(0, Math.min(1, body * grain)) * 165
      c.set(x, y, alpha(hex('#b9bcae'), a))
      if (t < 0.45) c.set(x, y, alpha(hex('#d5d7cb'), a * 0.6))
    }
  }
}

function drawEmber(c, rng) {
  const cx = (c.w - 1) / 2
  const cy = (c.h - 1) / 2
  const R = Math.min(c.w, c.h) * 0.5
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const t = Math.sqrt(dx * dx + dy * dy) / R
      if (t > 1) continue
      const a = Math.pow(1 - t, 1.4) * 255
      const col = t < 0.4 ? hex('#fff0c4') : t < 0.75 ? hex('#ffb648') : hex('#e2612a')
      c.set(x, y, alpha(col, a))
    }
  }
  // a couple of sparks
  for (let i = 0; i < 3; i++) {
    c.set(Math.floor(rng() * c.w), Math.floor(rng() * c.h), alpha(hex('#ffd98a'), 160))
  }
}

function drawSplash(c, rng) {
  const w = c.w
  const h = c.h
  const cx = w / 2
  const baseY = h - 2
  const foam = hex('#bfe0ec')
  const deep = alpha(hex('#7fb8cf'), 210)
  // base pool arc
  fillEllipse(c, cx, baseY + 2, w * 0.45, h * 0.28, deep)
  fillEllipse(c, cx - w * 0.1, baseY, w * 0.3, h * 0.16, alpha(foam, 220), true)
  // crown spikes
  const spikes = 5
  for (let i = 0; i < spikes; i++) {
    const t = i / (spikes - 1)
    const sx = w * 0.14 + t * w * 0.72
    const hgt = h * (0.35 + Math.sin(Math.PI * t) * 0.5) * (0.85 + rng() * 0.3)
    drawCurve(c, sx, baseY - h * 0.1, sx + (t - 0.5) * 3, baseY - hgt * 0.6, cx + (sx - cx) * 1.15, baseY - hgt,
      foam, (u) => 2.6 - u * 2)
  }
  // flying droplets
  const drops = 4
  for (let i = 0; i < drops; i++) {
    const dx = w * (0.15 + rng() * 0.7)
    const dy = h * (0.05 + rng() * 0.3)
    c.set(dx, dy, alpha(foam, 200))
    c.set(dx + 1, dy, alpha(foam, 150))
    c.set(dx, dy + 1, alpha(foam, 120))
  }
}

function drawRipple(c, rng) {
  const cx = (c.w - 1) / 2
  const cy = (c.h - 1) / 2
  const R = Math.min(c.w, c.h) * 0.44
  const ring = (radius, thickness, a, col) => {
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        const d = Math.sqrt(dx * dx + dy * dy)
        const k = (d - radius) / thickness
        const v = Math.exp(-k * k)
        if (v < 0.05) continue
        c.set(x, y, alpha(col, v * a))
      }
    }
  }
  ring(R, 1.8, 165, hex('#cfe8f0'))
  ring(R * 0.62, 1.6, 70, hex('#a8d4e2'))
  void rng
}

function drawFlameSheet(c, rng) {
  const frames = 4
  const fw = 32
  const fh = 48
  const factors = [0.72, 1, 0.86, 0.94]
  for (let f = 0; f < frames; f++) {
    const sub = new Canvas(fw, fh)
    const height = (fh - 2) * factors[f]
    const top = fh - height
    const cx = fw / 2
    const maxHalf = fw * 0.32
    const outer = hex('#c4552f')
    const mid = hex('#d9a441')
    const core = hex('#ffe9b0')
    for (let y = top; y < fh; y++) {
      const u = (y - top) / height
      let hw = maxHalf * Math.pow(u, 0.55)
      hw *= 0.9 + 0.1 * Math.sin(u * 5 + f * 2.1)
      const wob = Math.sin(u * 6.5 + f * 1.7) * (fw * 0.05) * (1 - u)
      const x0 = Math.round(cx + wob - hw)
      const x1 = Math.round(cx + wob + hw)
      for (let x = x0; x <= x1; x++) sub.set(x, y, alpha(outer, 235))
      const hw2 = hw * 0.6
      for (let x = Math.round(cx + wob - hw2); x <= Math.round(cx + wob + hw2); x++) {
        sub.set(x, y, alpha(mid, 240))
      }
      if (u > 0.25) {
        const hw3 = hw * 0.32
        for (let x = Math.round(cx + wob * 0.6 - hw3); x <= Math.round(cx + wob * 0.6 + hw3); x++) {
          sub.set(x, y, alpha(core, 245))
        }
      }
    }
    // hot base
    fillEllipse(sub, cx, fh - 2, fw * 0.28, 3.5, alpha(mid, 240))
    fillEllipse(sub, cx, fh - 2, fw * 0.16, 2.5, alpha(core, 245))
    outline(sub, alpha(hex('#7a2a10'), 200))
    blit(sub, c, f * fw, 0)
  }
  void rng
}

const EFFECT_DRAWERS = {
  raindrop: (c, rng) => drawRaindrop(c, rng),
  snowflake: (c, rng) => drawSnowflake(c, rng),
  leaf: (c, rng) => drawLeafEffect(c, rng),
  smoke_puff: (c, rng) => drawSmokePuff(c, rng),
  ember: (c, rng) => drawEmber(c, rng),
  splash: (c, rng) => drawSplash(c, rng),
  ripple: (c, rng) => drawRipple(c, rng),
  flame: (c, rng) => drawFlameSheet(c, rng),
}

// ---------------------------------------------------------------------------
// asset table — mirrors src/assets/assetManifest.ts (paths + exact dimensions)
// entries: [relativePathUnderPublic, width, height, drawerKind, frameIndex?]
// ---------------------------------------------------------------------------

const MANIFEST_DIMS = [
  // terrain — public/assets/tiles/*.png, all 48x48
  ['tiles/grass_0.png', 48, 48, 'grass'],
  ['tiles/grass_1.png', 48, 48, 'grass'],
  ['tiles/grass_2.png', 48, 48, 'grass'],
  ['tiles/forest_floor_0.png', 48, 48, 'forestFloor'],
  ['tiles/forest_floor_1.png', 48, 48, 'forestFloor'],
  ['tiles/forest_floor_2.png', 48, 48, 'forestFloor'],
  ['tiles/dirt_0.png', 48, 48, 'dirt'],
  ['tiles/dirt_1.png', 48, 48, 'dirt'],
  ['tiles/mud_0.png', 48, 48, 'mud'],
  ['tiles/mud_1.png', 48, 48, 'mud'],
  ['tiles/shallow_water_0.png', 48, 48, 'shallowWater', 0],
  ['tiles/shallow_water_1.png', 48, 48, 'shallowWater', 1],
  ['tiles/shallow_water_2.png', 48, 48, 'shallowWater', 2],
  ['tiles/shallow_water_3.png', 48, 48, 'shallowWater', 3],
  ['tiles/deep_water_0.png', 48, 48, 'deepWater', 0],
  ['tiles/deep_water_1.png', 48, 48, 'deepWater', 1],
  ['tiles/deep_water_2.png', 48, 48, 'deepWater', 2],
  ['tiles/deep_water_3.png', 48, 48, 'deepWater', 3],
  ['tiles/wetland_0.png', 48, 48, 'wetland', 0],
  ['tiles/wetland_1.png', 48, 48, 'wetland', 1],
  ['tiles/sand_0.png', 48, 48, 'sand'],
  ['tiles/sand_1.png', 48, 48, 'sand'],
  ['tiles/rock_0.png', 48, 48, 'rock'],
  ['tiles/rock_1.png', 48, 48, 'rock'],
  ['tiles/mountain_0.png', 48, 48, 'mountain'],
  ['tiles/mountain_1.png', 48, 48, 'mountain'],

  // vegetation — public/assets/vegetation/*.png
  ['vegetation/oak_seedling.png', 28, 28, 'oak_seedling'],
  ['vegetation/oak_young.png', 60, 60, 'oak_young'],
  ['vegetation/oak_mature.png', 108, 108, 'oak_mature'],
  ['vegetation/oak_old.png', 124, 124, 'oak_old'],
  ['vegetation/oak_dead.png', 92, 92, 'oak_dead'],
  ['vegetation/pine_seedling.png', 28, 28, 'pine_seedling'],
  ['vegetation/pine_young.png', 56, 56, 'pine_young'],
  ['vegetation/pine_mature.png', 100, 100, 'pine_mature'],
  ['vegetation/pine_dead.png', 84, 84, 'pine_dead'],
  ['vegetation/fern.png', 44, 44, 'fern'],
  ['vegetation/wildflower_a.png', 26, 26, 'wildflower_a'],
  ['vegetation/wildflower_b.png', 26, 26, 'wildflower_b'],
  ['vegetation/wildflower_c.png', 26, 26, 'wildflower_c'],
  ['vegetation/grass_cluster.png', 34, 34, 'grass_cluster'],
  ['vegetation/reeds.png', 44, 44, 'reeds'],
  ['vegetation/mushroom.png', 22, 22, 'mushroom'],
  ['vegetation/river_plant.png', 38, 38, 'river_plant'],
  ['vegetation/bush.png', 56, 56, 'bush'],
  ['vegetation/stump.png', 38, 38, 'stump'],

  // environment props — public/assets/environment/*.png
  ['environment/rock_small.png', 34, 28, 'rock_small'],
  ['environment/rock_large.png', 58, 46, 'rock_large'],
  ['environment/log.png', 76, 30, 'log'],
  ['environment/branch.png', 44, 20, 'branch'],
  ['environment/nest.png', 34, 26, 'nest'],
  ['environment/lily_pad.png', 32, 30, 'lily_pad'],
  ['environment/fallen_tree.png', 100, 44, 'fallen_tree'],

  // animal spritesheets — public/assets/animals/*.png
  // sheet size = (max frames) x frame  by  (states x directions) x frame
  ['animals/deer.png', 192, 768, 'animal:deer'],
  ['animals/rabbit.png', 128, 384, 'animal:rabbit'],
  ['animals/squirrel.png', 128, 256, 'animal:squirrel'],
  ['animals/wolf.png', 176, 528, 'animal:wolf'],
  ['animals/fox.png', 160, 480, 'animal:fox'],
  ['animals/eagle.png', 224, 448, 'animal:eagle'],
  ['animals/songbird.png', 104, 208, 'animal:songbird'],
  ['animals/fish.png', 136, 34, 'animal:fish'],

  // effects — public/assets/effects/*.png (flame = 4 frames of 32x48)
  ['effects/raindrop.png', 6, 16, 'raindrop'],
  ['effects/snowflake.png', 8, 8, 'snowflake'],
  ['effects/leaf.png', 12, 12, 'leaf'],
  ['effects/smoke_puff.png', 48, 48, 'smoke_puff'],
  ['effects/ember.png', 6, 6, 'ember'],
  ['effects/splash.png', 26, 20, 'splash'],
  ['effects/ripple.png', 40, 40, 'ripple'],
  ['effects/flame.png', 128, 48, 'flame'],
]

const DRAWERS = {
  ...TILE_DRAWERS,
  ...VEGETATION_DRAWERS,
  ...ENVIRONMENT_DRAWERS,
  ...EFFECT_DRAWERS,
  'animal:deer': (c) => drawAnimalSheet(c, 'deer'),
  'animal:rabbit': (c) => drawAnimalSheet(c, 'rabbit'),
  'animal:squirrel': (c) => drawAnimalSheet(c, 'squirrel'),
  'animal:wolf': (c) => drawAnimalSheet(c, 'wolf'),
  'animal:fox': (c) => drawAnimalSheet(c, 'fox'),
  'animal:eagle': (c) => drawAnimalSheet(c, 'eagle'),
  'animal:songbird': (c) => drawAnimalSheet(c, 'songbird'),
  'animal:fish': (c) => drawAnimalSheet(c, 'fish'),
}

/** sheet dims derived from ANIMAL_SPECS — cross-checked against MANIFEST_DIMS */
function expectedSheetSize(species) {
  const spec = ANIMAL_SPECS[species]
  const cols = Math.max(...spec.states.map(([, frames]) => frames))
  const rows = spec.states.length * spec.directions
  return [cols * spec.frame, rows * spec.frame]
}

function assertTableConsistency() {
  const seen = new Set()
  for (const [rel, w, h, kind] of MANIFEST_DIMS) {
    if (seen.has(rel)) throw new Error(`duplicate table entry: ${rel}`)
    seen.add(rel)
    if (!DRAWERS[kind]) throw new Error(`no drawer registered for kind "${kind}" (${rel})`)
    if (kind.startsWith('animal:')) {
      const [ew, eh] = expectedSheetSize(kind.slice('animal:'.length))
      if (ew !== w || eh !== h) {
        throw new Error(`sheet table mismatch for ${rel}: table ${w}x${h} vs spec ${ew}x${eh}`)
      }
    }
  }
  if (MANIFEST_DIMS.length !== 68) {
    throw new Error(`expected 68 assets, table has ${MANIFEST_DIMS.length}`)
  }
}

// ---------------------------------------------------------------------------
// generate / verify
// ---------------------------------------------------------------------------

function generateAssets() {
  assertTableConsistency()
  const perDir = new Map()
  for (const [rel, w, h, kind, frame] of MANIFEST_DIMS) {
    const canvas = new Canvas(w, h, rel.startsWith('tiles/'))
    DRAWERS[kind](canvas, rngFor(rel), frame ?? 0)
    assertCanvasIntegrity(canvas, rel, kind)
    const outPath = path.join(OUTPUT_ROOT, rel)
    mkdirSync(path.dirname(outPath), { recursive: true })
    writeFileSync(outPath, encodePNG(w, h, canvas.d))
    const dir = path.dirname(rel)
    perDir.set(dir, (perDir.get(dir) ?? 0) + 1)
  }
  console.log(`generated ${MANIFEST_DIMS.length} assets:`)
  for (const [dir, n] of [...perDir.entries()].sort()) console.log(`  ${dir}/: ${n}`)
  printWaterVariation()
}

/**
 * Catches drawing bugs that only show up as bad pixels: terrain tiles must be
 * fully opaque (a hole in a tile would show the page background through the
 * world), every sprite must draw something, and every spritesheet frame cell
 * must contain a creature.
 */
function assertCanvasIntegrity(canvas, rel, kind) {
  if (rel.startsWith('tiles/')) {
    for (let i = 3; i < canvas.d.length; i += 4) {
      if (canvas.d[i] !== 255) {
        throw new Error(`tile ${rel}: non-opaque pixel at byte ${i - 3} (alpha=${canvas.d[i]})`)
      }
    }
    return
  }
  if (canvas.opaqueCount() === 0) throw new Error(`${rel}: sprite drew nothing`)

  if (kind.startsWith('animal:')) {
    const spec = ANIMAL_SPECS[kind.slice('animal:'.length)]
    for (let row = 0; row < canvas.h; row += spec.frame) {
      for (let col = 0; col < canvas.w; col += spec.frame) {
        let n = 0
        for (let y = row; y < row + spec.frame && y < canvas.h; y++) {
          for (let x = col; x < col + spec.frame && x < canvas.w; x++) {
            if (canvas.d[(y * canvas.w + x) * 4 + 3] > 8) n++
          }
        }
        if (n < 4) {
          throw new Error(`${rel}: frame cell at col ${col / spec.frame}, row ${row / spec.frame} is empty`)
        }
      }
    }
  }
}

/** % of pixels that differ between consecutive animation frames of each water tile */
function printWaterVariation() {
  const bad = []
  const groups = [
    ['shallowWater', 4],
    ['deepWater', 4],
    ['wetland', 2],
  ]
  for (const [kind, frames] of groups) {
    const canvases = []
    for (let f = 0; f < frames; f++) {
      const c = new Canvas(TILE_SIZE, TILE_SIZE, true)
      TILE_DRAWERS[kind](c, rngFor(`tiles/${kind}_${f}.png`), f)
      canvases.push(c)
    }
    let total = 0
    let pairs = 0
    for (let f = 0; f < frames; f++) {
      const a = canvases[f]
      const b = canvases[(f + 1) % frames]
      let diff = 0
      for (let i = 0; i < a.d.length; i += 4) {
        if (a.d[i] !== b.d[i] || a.d[i + 1] !== b.d[i + 1] || a.d[i + 2] !== b.d[i + 2]) diff++
      }
      total += diff / (a.w * a.h)
      pairs++
    }
    const pct = ((total / pairs) * 100).toFixed(1)
    const ratio = total / pairs
    const ok = ratio >= 0.3 && ratio <= 0.5
    console.log(`  ${kind}: ${pct}% of pixels vary between frames${ok ? '' : '  <-- OUT OF 30-50% BAND'}`)
    if (!ok) bad.push(`${kind} ${pct}%`)
  }
  if (bad.length > 0) {
    console.error(`water animation out of spec (need 30-50% of pixels varying): ${bad.join(', ')}`)
    process.exit(1)
  }
}

function verifyAssets() {
  assertTableConsistency()
  let failures = 0
  const expected = new Set(MANIFEST_DIMS.map(([rel]) => rel))
  for (const [rel, w, h, kind] of MANIFEST_DIMS) {
    const p = path.join(OUTPUT_ROOT, rel)
    if (!existsSync(p)) {
      console.error(`MISSING  ${rel}`)
      failures++
      continue
    }
    try {
      const ihdr = readIHDR(readFileSync(p))
      if (ihdr.width !== w || ihdr.height !== h) {
        console.error(`BAD SIZE ${rel}: found ${ihdr.width}x${ihdr.height}, expected ${w}x${h}`)
        failures++
        continue
      }
      const { rgba } = decodeRGBA(readFileSync(p))
      const canvas = new Canvas(w, h, rel.startsWith('tiles/'))
      canvas.d = rgba
      assertCanvasIntegrity(canvas, rel, kind)
    } catch (err) {
      console.error(`BAD PNG  ${rel}: ${err.message}`)
      failures++
    }
  }
  // stray files (wrong folder names, leftovers from older runs, …)
  const walk = (dir) => {
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.png')) {
        const rel = path.relative(OUTPUT_ROOT, p).split(path.sep).join('/')
        if (!expected.has(rel)) {
          console.error(`UNEXPECTED ${rel}`)
          failures++
        }
      }
    }
  }
  walk(OUTPUT_ROOT)

  if (failures > 0) {
    console.error(`verify FAILED: ${failures} problem(s)`)
    process.exit(1)
  }
  console.log(`verify OK: ${MANIFEST_DIMS.length} assets match src/assets/assetManifest.ts`)
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const verify = process.argv.includes('--verify')
  if (verify) verifyAssets()
  else generateAssets()
}

main()

