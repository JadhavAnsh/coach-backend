import { describe, expect, test } from "bun:test"
import { hash, randomToken } from "../src/modules/auth/session"

describe("desktop auth ticket rules", () => {
  test("PKCE verifier hashing is stable for the same verifier", () => {
    const verifier = "coach-desktop-verifier-1234567890"
    expect(hash(verifier)).toBe(hash(verifier))
  })

  test("different verifiers produce different challenges", () => {
    expect(hash("verifier-a")).not.toBe(hash("verifier-b"))
  })

  test("issued desktop tickets are high-entropy and unique", () => {
    const tickets = new Set(Array.from({ length: 20 }, () => randomToken()))
    expect(tickets.size).toBe(20)
    for (const ticket of tickets) expect(ticket.length).toBeGreaterThan(40)
  })
})
