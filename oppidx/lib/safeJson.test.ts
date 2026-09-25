import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseJsonArray } from './safeJson'

afterEach(() => vi.restoreAllMocks())

const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

describe('parseJsonArray', () => {
  it('returns the array for well-formed input', () => {
    expect(parseJsonArray<number>('[1,2,3]', 't')).toEqual([1, 2, 3])
  })

  it('returns [] for an empty array', () => {
    expect(parseJsonArray('[]', 't')).toEqual([])
  })

  it('returns [] rather than throwing on malformed JSON', () => {
    quiet()
    // The regression this exists for: one truncated row used to take down
    // whatever was reading it, up to and including the homepage.
    expect(parseJsonArray('[{"a":1},', 't')).toEqual([])
  })

  it('returns [] for valid JSON that is not an array', () => {
    quiet()
    // Both of these parse fine and then explode downstream on .length.
    expect(parseJsonArray('null', 't')).toEqual([])
    expect(parseJsonArray('{"a":1}', 't')).toEqual([])
    expect(parseJsonArray('"a string"', 't')).toEqual([])
  })

  it('returns [] for null, undefined and empty string', () => {
    expect(parseJsonArray(null, 't')).toEqual([])
    expect(parseJsonArray(undefined, 't')).toEqual([])
    expect(parseJsonArray('', 't')).toEqual([])
  })

  it('names the context when it complains, so the bad row is findable', () => {
    const spy = quiet()
    parseJsonArray('{oops', 'PolicyDigest.items 2026-08-14')
    expect(spy.mock.calls[0][0]).toContain('PolicyDigest.items 2026-08-14')
  })
})
