import { describe, it, expect } from "vitest"
import {
  validateIpv4,
  validateHost,
  validateStoredIp,
  validateEventLogEntry,
  parseEventLog,
} from "../validation"

describe("validation", () => {
  describe("validateIpv4", () => {
    it("accepts valid IPv4 addresses", () => {
      const result = validateIpv4("192.168.1.1")
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.value).toBe("192.168.1.1")
      }
    })

    it("accepts edge case IPv4 addresses", () => {
      expect(validateIpv4("0.0.0.0").success).toBe(true)
      expect(validateIpv4("255.255.255.255").success).toBe(true)
      expect(validateIpv4("127.0.0.1").success).toBe(true)
    })

    it("rejects invalid IPv4 addresses", () => {
      expect(validateIpv4("256.1.1.1").success).toBe(false)
      expect(validateIpv4("192.168.1").success).toBe(false)
      expect(validateIpv4("192.168.1.1.1").success).toBe(false)
      expect(validateIpv4("abc.def.ghi.jkl").success).toBe(false)
    })

    it("rejects empty input", () => {
      expect(validateIpv4("").success).toBe(false)
      expect(validateIpv4("   ").success).toBe(false)
    })

    it("trims whitespace before validation", () => {
      const result = validateIpv4("  192.168.1.1  ")
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.value).toBe("192.168.1.1")
      }
    })
  })

  describe("validateHost", () => {
    it("accepts valid IPv4 addresses", () => {
      expect(validateHost("192.168.1.1").success).toBe(true)
    })

    it("accepts localhost", () => {
      expect(validateHost("localhost").success).toBe(true)
    })

    it("accepts valid hostnames", () => {
      expect(validateHost("example.com").success).toBe(true)
      expect(validateHost("my-device").success).toBe(true)
      expect(validateHost("device.local").success).toBe(true)
      expect(validateHost("test-server.example.com").success).toBe(true)
    })

    it("rejects invalid hostnames", () => {
      expect(validateHost("").success).toBe(false)
      expect(validateHost("   ").success).toBe(false)
    })
  })

  describe("validateStoredIp", () => {
    it("accepts valid stored IP as string", () => {
      const result = validateStoredIp("192.168.1.1")
      expect(result.success).toBe(true)
    })

    it("rejects non-string stored IP", () => {
      expect(validateStoredIp(123).success).toBe(false)
      expect(validateStoredIp(null).success).toBe(false)
      expect(validateStoredIp(undefined).success).toBe(false)
      expect(validateStoredIp({}).success).toBe(false)
    })

    it("accepts valid hostname format as stored IP", () => {
      const result = validateStoredIp("my-device.local")
      expect(result.success).toBe(true)
    })
  })

  describe("validateEventLogEntry", () => {
    it("accepts valid event log entry", () => {
      const entry = {
        id: "evt-001",
        time: "10:30:45",
        source: "UI",
        target: "Channel 1",
        action: "Toggle",
        result: "Success",
        notes: "Manual test",
      }
      const result = validateEventLogEntry(entry)
      expect(result.success).toBe(true)
    })

    it("accepts entry without optional notes", () => {
      const entry = {
        id: "evt-001",
        time: "10:30:45",
        source: "UI",
        target: "Channel 1",
        action: "Toggle",
        result: "Success",
      }
      const result = validateEventLogEntry(entry)
      expect(result.success).toBe(true)
    })

    it("rejects entries with missing required fields", () => {
      const entry = {
        time: "10:30:45",
        source: "UI",
        // missing id, target, action, result
      }
      expect(validateEventLogEntry(entry).success).toBe(false)
    })

    it("rejects entries with oversized fields", () => {
      const entry = {
        id: "x".repeat(101), // Exceeds 100 char limit
        time: "10:30:45",
        source: "UI",
        target: "Channel 1",
        action: "Toggle",
        result: "Success",
      }
      expect(validateEventLogEntry(entry).success).toBe(false)
    })

    it("rejects entries with oversized notes", () => {
      const entry = {
        id: "evt-001",
        time: "10:30:45",
        source: "UI",
        target: "Channel 1",
        action: "Toggle",
        result: "Success",
        notes: "x".repeat(501), // Exceeds 500 char limit
      }
      expect(validateEventLogEntry(entry).success).toBe(false)
    })

    it("rejects non-object input", () => {
      expect(validateEventLogEntry("not an object").success).toBe(false)
      expect(validateEventLogEntry(null).success).toBe(false)
      expect(validateEventLogEntry(undefined).success).toBe(false)
    })
  })

  describe("parseEventLog", () => {
    it("parses valid event log array", () => {
      const log = [
        {
          id: "evt-001",
          time: "10:30:45",
          source: "UI",
          target: "Channel 1",
          action: "Toggle",
          result: "Success",
        },
        {
          id: "evt-002",
          time: "10:31:45",
          source: "PD",
          target: "All Channels",
          action: "Status",
          result: "Success",
        },
      ]
      const result = parseEventLog(log)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe("evt-001")
      expect(result[1].id).toBe("evt-002")
    })

    it("filters out invalid entries", () => {
      const log = [
        {
          id: "evt-001",
          time: "10:30:45",
          source: "UI",
          target: "Channel 1",
          action: "Toggle",
          result: "Success",
        },
        {
          id: "x".repeat(101), // Invalid
          time: "10:31:45",
          source: "PD",
          target: "All Channels",
          action: "Status",
          result: "Success",
        },
      ]
      const result = parseEventLog(log)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("evt-001")
    })

    it("returns empty array for non-array input", () => {
      expect(parseEventLog("not an array")).toEqual([])
      expect(parseEventLog(null)).toEqual([])
      expect(parseEventLog({})).toEqual([])
    })

    it("limits results to 25 entries", () => {
      const log = Array.from({ length: 50 }, (_, i) => ({
        id: `evt-${i}`,
        time: "10:30:45",
        source: "UI",
        target: "Channel 1",
        action: "Toggle",
        result: "Success",
      }))
      const result = parseEventLog(log)
      expect(result).toHaveLength(25)
    })
  })
})
