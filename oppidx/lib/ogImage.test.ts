import { describe, it, expect } from 'vitest'
import { isPrivateAddress } from './ogImage'

/**
 * The SSRF guard's address rules. Every "must block" case here is a real
 * address of an internal target — if one of these ever returns false, a URL
 * a third party put in an og:image tag can make our own server fetch it.
 */
describe('isPrivateAddress', () => {
  it('blocks IPv4 loopback, private, link-local and metadata ranges', () => {
    for (const ip of [
      '127.0.0.1', '127.1.2.3',
      '10.0.0.1', '10.255.255.255',
      '192.168.1.1',
      '172.16.0.1', '172.31.255.255',
      '169.254.169.254', // cloud instance metadata
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('blocks the ranges that were previously unlisted', () => {
    for (const ip of [
      '0.0.0.0', '0.1.2.3',       // 0.0.0.0/8 reaches the local host on Linux
      '100.64.0.1', '100.127.0.1', // carrier-grade NAT
      '192.0.0.1',                 // IETF protocol assignments
      '::',                        // IPv6 unspecified
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('blocks IPv4-mapped IPv6 forms of a private address', () => {
    // Both spellings resolve to the same host as the bare IPv4 address, and
    // both slipped past the IPv4 regexes before they were unwrapped.
    for (const ip of [
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '::ffff:169.254.169.254',
      '::ffff:7f00:1',   // hex spelling of 127.0.0.1
      '::FFFF:7F00:1',   // and case-insensitively
      '::ffff:a00:1',    // hex spelling of 10.0.0.1
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('blocks IPv6 loopback, link-local and unique-local', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it('allows ordinary public addresses', () => {
    for (const ip of [
      '8.8.8.8',
      '1.1.1.1',
      '172.15.0.1', '172.32.0.1', // just outside 172.16/12
      '100.63.0.1', '100.128.0.1', // just outside 100.64/10
      '192.0.1.1',                 // just outside 192.0.0.0/24
      '2606:4700:4700::1111',
      '::ffff:8.8.8.8',            // mapped, but a public target
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })
})
