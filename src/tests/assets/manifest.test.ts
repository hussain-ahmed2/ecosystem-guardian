import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  allAssetUrls,
  animalSprites,
  effectSprites,
  environmentSprites,
  flameSheet,
  terrainSprites,
  vegetationSprites,
} from '@/assets/assetManifest'
import type { SingleSprite, SpriteSheet } from '@/assets/assetManifest'

/**
 * The generated files under public/assets must satisfy the manifest contract
 * exactly. If anything here fails, fix scripts/generate-assets.mjs — never
 * the manifest.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Minimal PNG IHDR reader: returns width/height (and colour format) of a file. */
function readIHDR(absPath: string): { width: number; height: number; bitDepth: number; colorType: number } {
  const buf = readFileSync(absPath)
  expect(buf.length).toBeGreaterThan(24)
  expect([...buf.subarray(0, 8)]).toEqual(PNG_SIGNATURE)

  let offset = 8
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    if (type === 'IHDR') {
      expect(length).toBeGreaterThanOrEqual(13)
      return {
        width: buf.readUInt32BE(offset + 8),
        height: buf.readUInt32BE(offset + 12),
        bitDepth: buf[offset + 16],
        colorType: buf[offset + 17],
      }
    }
    offset += 12 + length
  }
  throw new Error(`IHDR chunk not found in ${absPath}`)
}

function absFor(url: string): string {
  expect(url.startsWith('/assets/')).toBe(true)
  return path.join(PROJECT_ROOT, 'public', url)
}

/** Rows occupied by a sheet: every state block spans `directions` rows. */
function expectedSheetSize(sheet: SpriteSheet): { width: number; height: number; frames: number } {
  const states = Object.values(sheet.states)
  expect(states.length).toBeGreaterThan(0)

  let maxFrames = 0
  let rows = 0
  for (const state of states) {
    expect(state.row).toBeGreaterThanOrEqual(0)
    expect(state.frames).toBeGreaterThan(0)
    expect(Number.isInteger(state.row)).toBe(true)
    maxFrames = Math.max(maxFrames, state.frames)
    rows = Math.max(rows, state.row + sheet.directions)
  }
  // direction blocks must not overlap
  const sorted = [...states].sort((a, b) => a.row - b.row)
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i].row).toBeGreaterThanOrEqual(sorted[i - 1].row + sheet.directions)
  }

  return {
    width: maxFrames * sheet.frameWidth,
    height: rows * sheet.frameHeight,
    frames: maxFrames,
  }
}

type SingleEntry = { url: string; sprite: SingleSprite; group: string }

const singleSprites: SingleEntry[] = [
  ...Object.entries(terrainSprites).flatMap(([key, variants]) =>
    variants.map((sprite, i) => ({ url: sprite.src, sprite, group: `terrain[${key}][${i}]` })),
  ),
  ...Object.entries(vegetationSprites).map(([key, sprite]) => ({ url: sprite.src, sprite, group: `vegetation[${key}]` })),
  ...Object.entries(environmentSprites).map(([key, sprite]) => ({ url: sprite.src, sprite, group: `environment[${key}]` })),
  ...Object.entries(effectSprites).map(([key, sprite]) => ({ url: sprite.src, sprite, group: `effects[${key}]` })),
]

const sheetEntries: Array<{ url: string; sheet: SpriteSheet; group: string }> = [
  ...Object.entries(animalSprites).map(([key, sheet]) => ({ url: sheet.src, sheet, group: `animals[${key}]` })),
  { url: flameSheet.src, sheet: flameSheet, group: 'flame' },
]

describe('asset manifest ↔ generated files', () => {
  it('every single sprite exists at public<url> with the declared pixel size', () => {
    expect(singleSprites.length).toBeGreaterThan(0)
    for (const { url, sprite, group } of singleSprites) {
      const abs = absFor(url)
      expect(existsSync(abs), `${group}: missing file ${url}`).toBe(true)

      const ihdr = readIHDR(abs)
      expect({ group, url, width: ihdr.width, height: ihdr.height }).toEqual({
        group,
        url,
        width: sprite.width,
        height: sprite.height,
      })
      expect(ihdr.bitDepth).toBe(8)
      expect(ihdr.colorType).toBe(6) // RGBA
    }
  })

  it('every spritesheet exists with frame dims and a states×directions layout', () => {
    expect(sheetEntries.length).toBeGreaterThan(0)
    for (const { url, sheet, group } of sheetEntries) {
      const abs = absFor(url)
      expect(existsSync(abs), `${group}: missing file ${url}`).toBe(true)

      expect(sheet.frameWidth, `${group}: frameWidth`).toBeGreaterThan(0)
      expect(sheet.frameHeight, `${group}: frameHeight`).toBeGreaterThan(0)
      expect([1, 4], `${group}: directions`).toContain(sheet.directions)
      const expected = expectedSheetSize(sheet)

      const ihdr = readIHDR(abs)
      expect(ihdr.width % sheet.frameWidth, `${group}: width divisible by frameWidth`).toBe(0)
      expect(ihdr.height % sheet.frameHeight, `${group}: height divisible by frameHeight`).toBe(0)
      expect({ group, url, width: ihdr.width, height: ihdr.height }).toEqual({
        group,
        url,
        width: expected.width,
        height: expected.height,
      })
      expect(ihdr.bitDepth).toBe(8)
      expect(ihdr.colorType).toBe(6)
    }
  })

  it('fish has a single direction per state row', () => {
    expect(animalSprites.fish.directions).toBe(1)
    const ihdr = readIHDR(absFor(animalSprites.fish.src))
    expect(ihdr.width).toBe(animalSprites.fish.states.swim.frames * animalSprites.fish.frameWidth)
    expect(ihdr.height).toBe(animalSprites.fish.frameHeight)
  })

  it('flame sheet is 4 frames of 32x48 in a single row', () => {
    expect(flameSheet.states.burn).toEqual({ row: 0, frames: 4 })
    const ihdr = readIHDR(absFor(flameSheet.src))
    expect(ihdr.width).toBe(4 * flameSheet.frameWidth)
    expect(ihdr.height).toBe(1 * flameSheet.frameHeight)
  })

  it('allAssetUrls lists every declared sprite exactly once', () => {
    const urls = allAssetUrls()
    expect(new Set(urls).size).toBe(urls.length)

    const declared = [
      ...singleSprites.map((e) => e.url),
      ...sheetEntries.map((e) => e.url),
    ]
    expect(urls.length).toBe(declared.length)
    for (const url of declared) expect(urls, `allAssetUrls missing ${url}`).toContain(url)
    for (const url of urls) expect(existsSync(absFor(url)), `allAssetUrls points at missing ${url}`).toBe(true)
  })
})
