// Tests for the tenant-wide Microsoft inbox injection helpers.

import { describe, expect, it } from 'vitest'
import { appOnlyTenantFor, graphInboxMessagesUrl, parseAppOnlyDomains } from './logic'

describe('parseAppOnlyDomains', () => {
  it('returns an empty map when unset', () => {
    expect(parseAppOnlyDomains(undefined).size).toBe(0)
    expect(parseAppOnlyDomains('').size).toBe(0)
  })

  it('uses the domain as the tenant by default', () => {
    expect(parseAppOnlyDomains('isgdfw.com').get('isgdfw.com')).toBe('isgdfw.com')
  })

  it('accepts explicit tenant ids, whitespace and casing', () => {
    const map = parseAppOnlyDomains(' ISGDFW.com = abc-123 , other.com ,, ')
    expect(map.get('isgdfw.com')).toBe('abc-123')
    expect(map.get('other.com')).toBe('other.com')
    expect(map.size).toBe(2)
  })
})

describe('appOnlyTenantFor', () => {
  const domains = parseAppOnlyDomains('isgdfw.com')

  it('matches enabled domains case-insensitively', () => {
    expect(appOnlyTenantFor('KJohns@ISGDFW.com', domains)).toBe('isgdfw.com')
  })

  it('returns null for other domains or missing mailboxes', () => {
    expect(appOnlyTenantFor('holly@iipllc.org', domains)).toBeNull()
    expect(appOnlyTenantFor(undefined, domains)).toBeNull()
    expect(appOnlyTenantFor('not-an-email', domains)).toBeNull()
  })
})

describe('graphInboxMessagesUrl', () => {
  it('targets /me without a mailbox', () => {
    expect(graphInboxMessagesUrl()).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages')
  })

  it('targets the user mailbox when given one', () => {
    expect(graphInboxMessagesUrl('kjohns@isgdfw.com')).toBe(
      'https://graph.microsoft.com/v1.0/users/kjohns%40isgdfw.com/mailFolders/inbox/messages'
    )
  })
})
