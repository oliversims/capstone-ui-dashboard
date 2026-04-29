import { describe, it, expect } from "vitest"
import {
  mapChannelStateToLegacyStatus,
  getActiveChannelCount,
  rssiToPercent,
  phaseForChannelNumber,
  formatVoltageStat,
  getEventStatus,
  getEventStatusBadgeClass,
  filterEventLog,
  calculateWaveformStats,
  calculateWaveformYDomain,
} from "../page-utils"
import type { ChannelState, EventLogEntry } from "../types"

describe("page-utils", () => {
  describe("mapChannelStateToLegacyStatus", () => {
    it("returns 'fault' when fault flag is set", () => {
      const channel: ChannelState = {
        number: 1,
        label: "Circuit 1",
        phase: "A",
        gpio: "GPIO 13",
        enabled: true,
        commandedState: "on",
        actualState: "on",
        continuity: "closed",
        fault: "Short circuit",
        lastCommand: "ON",
        lastResponse: "OK",
        testResult: "passed",
      }
      expect(mapChannelStateToLegacyStatus(channel)).toBe("fault")
    })

    it("returns 'active' when commanded or actual state is 'on'", () => {
      const channel: ChannelState = {
        number: 1,
        label: "Circuit 1",
        phase: "A",
        gpio: "GPIO 13",
        enabled: true,
        commandedState: "on",
        actualState: "off",
        continuity: "closed",
        fault: null,
        lastCommand: "ON",
        lastResponse: "OK",
        testResult: "passed",
      }
      expect(mapChannelStateToLegacyStatus(channel)).toBe("active")
    })

    it("returns 'inactive' when both states are 'off'", () => {
      const channel: ChannelState = {
        number: 1,
        label: "Circuit 1",
        phase: "A",
        gpio: "GPIO 13",
        enabled: true,
        commandedState: "off",
        actualState: "off",
        continuity: "open",
        fault: null,
        lastCommand: "OFF",
        lastResponse: "OK",
        testResult: "untested",
      }
      expect(mapChannelStateToLegacyStatus(channel)).toBe("inactive")
    })
  })

  describe("getActiveChannelCount", () => {
    it("counts channels in 'on' state", () => {
      const channels: ChannelState[] = [
        {
          number: 1,
          label: "Ch1",
          phase: "A",
          gpio: "G13",
          enabled: true,
          commandedState: "on",
          actualState: "on",
          continuity: "closed",
          fault: null,
          lastCommand: "ON",
          lastResponse: "OK",
          testResult: "passed",
        },
        {
          number: 2,
          label: "Ch2",
          phase: "B",
          gpio: "G14",
          enabled: true,
          commandedState: "on",
          actualState: "on",
          continuity: "closed",
          fault: null,
          lastCommand: "ON",
          lastResponse: "OK",
          testResult: "passed",
        },
        {
          number: 3,
          label: "Ch3",
          phase: "C",
          gpio: "G15",
          enabled: true,
          commandedState: "off",
          actualState: "off",
          continuity: "open",
          fault: null,
          lastCommand: "OFF",
          lastResponse: "OK",
          testResult: "passed",
        },
      ]
      expect(getActiveChannelCount(channels)).toBe(2)
    })

    it("counts channels with commanded 'on' even if actual is different", () => {
      const channels: ChannelState[] = [
        {
          number: 1,
          label: "Ch1",
          phase: "A",
          gpio: "G13",
          enabled: true,
          commandedState: "on",
          actualState: "off",
          continuity: "open",
          fault: null,
          lastCommand: "ON",
          lastResponse: "OK",
          testResult: "failed",
        },
      ]
      expect(getActiveChannelCount(channels)).toBe(1)
    })

    it("returns 0 for empty array", () => {
      expect(getActiveChannelCount([])).toBe(0)
    })
  })

  describe("rssiToPercent", () => {
    it("returns 100% for strong signal >= -50", () => {
      expect(rssiToPercent(-50)).toBe("100%")
      expect(rssiToPercent(-40)).toBe("100%")
      expect(rssiToPercent(0)).toBe("100%")
    })

    it("returns 0% for weak signal <= -100", () => {
      expect(rssiToPercent(-100)).toBe("0%")
      expect(rssiToPercent(-120)).toBe("0%")
      expect(rssiToPercent(-200)).toBe("0%")
    })

    it("calculates percentage for mid-range signals", () => {
      expect(rssiToPercent(-75)).toBe("50%")
      expect(rssiToPercent(-60)).toBe("80%")
    })
  })

  describe("phaseForChannelNumber", () => {
    it("maps channels 1-6 to phases A-F", () => {
      expect(phaseForChannelNumber(1)).toBe("A")
      expect(phaseForChannelNumber(2)).toBe("B")
      expect(phaseForChannelNumber(3)).toBe("C")
      expect(phaseForChannelNumber(4)).toBe("D")
      expect(phaseForChannelNumber(5)).toBe("E")
      expect(phaseForChannelNumber(6)).toBe("F")
    })

    it("cycles back to A for channel 7+", () => {
      expect(phaseForChannelNumber(7)).toBe("A")
      expect(phaseForChannelNumber(8)).toBe("B")
      expect(phaseForChannelNumber(12)).toBe("F")
      expect(phaseForChannelNumber(13)).toBe("A")
    })

    it("handles negative and decimal numbers", () => {
      expect(phaseForChannelNumber(-1)).toBe("A")
      expect(phaseForChannelNumber(0)).toBe("A")
      expect(phaseForChannelNumber(1.5)).toBe("A")
      expect(phaseForChannelNumber(2.9)).toBe("B")
    })
  })

  describe("formatVoltageStat", () => {
    it("formats valid numbers with precision", () => {
      expect(formatVoltageStat(120.456)).toBe("120.456 V")
      expect(formatVoltageStat(120.456, 1)).toBe("120.5 V")
      expect(formatVoltageStat(120.456, 2)).toBe("120.46 V")
    })

    it("returns '--' for null", () => {
      expect(formatVoltageStat(null)).toBe("--")
    })

    it("returns '--' for non-finite numbers", () => {
      expect(formatVoltageStat(NaN)).toBe("--")
      expect(formatVoltageStat(Infinity)).toBe("--")
      expect(formatVoltageStat(-Infinity)).toBe("--")
    })
  })

  describe("getEventStatus", () => {
    it("detects Initialized status", () => {
      expect(getEventStatus("initialized", "startup")).toBe("Initialized")
      expect(getEventStatus("boot", "process")).toBe("Initialized")
    })

    it("detects Disconnected status", () => {
      expect(getEventStatus("Disconnected", "event")).toBe("Disconnected")
      expect(getEventStatus("disconnect", "connection")).toBe("Disconnected")
    })

    it("detects Failed status", () => {
      expect(getEventStatus("Failed", "attempt")).toBe("Failed")
      expect(getEventStatus("error", "occurred")).toBe("Failed")
      expect(getEventStatus("timeout", "retry")).toBe("Failed")
    })

    it("detects Warning status", () => {
      expect(getEventStatus("warning", "issued")).toBe("Warning")
      expect(getEventStatus("offline", "device")).toBe("Warning")
    })

    it("detects Success status", () => {
      expect(getEventStatus("Success", "completed")).toBe("Success")
      expect(getEventStatus("connected", "established")).toBe("Success")
    })

    it("defaults to Info status", () => {
      expect(getEventStatus("unknown", "action")).toBe("Info")
    })
  })

  describe("getEventStatusBadgeClass", () => {
    it("returns appropriate CSS classes for each status", () => {
      expect(getEventStatusBadgeClass("Success")).toContain("emerald")
      expect(getEventStatusBadgeClass("Failed")).toContain("red")
      expect(getEventStatusBadgeClass("Warning")).toContain("amber")
      expect(getEventStatusBadgeClass("Disconnected")).toContain("slate")
      expect(getEventStatusBadgeClass("Initialized")).toContain("violet")
      expect(getEventStatusBadgeClass("Info")).toContain("sky")
    })
  })

  describe("filterEventLog", () => {
    const sampleLog: EventLogEntry[] = [
      {
        id: "1",
        time: "10:00",
        source: "UI",
        target: "Channel 1",
        action: "Toggle",
        result: "Success",
      },
      {
        id: "2",
        time: "10:01",
        source: "PD",
        target: "All Channels",
        action: "Status",
        result: "Success",
      },
      {
        id: "3",
        time: "10:02",
        source: "CH",
        target: "Channel 2",
        action: "Toggle",
        result: "Failed",
      },
    ]

    it("returns all entries when no filters applied", () => {
      const result = filterEventLog(sampleLog, {})
      expect(result).toHaveLength(3)
    })

    it("filters by source", () => {
      const result = filterEventLog(sampleLog, { source: "UI" })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("1")
    })

    it("filters by target", () => {
      const result = filterEventLog(sampleLog, { target: "Channel 1" })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("1")
    })

    it("filters by action", () => {
      const result = filterEventLog(sampleLog, { action: "Toggle" })
      expect(result).toHaveLength(2)
    })

    it("respects 'All' option as no filter", () => {
      const result = filterEventLog(sampleLog, { source: "All" }, "All")
      expect(result).toHaveLength(3)
    })

    it("combines multiple filters with AND logic", () => {
      const result = filterEventLog(sampleLog, { source: "UI", action: "Toggle" })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("1")
    })
  })

  describe("calculateWaveformStats", () => {
    it("calculates stats for valid voltage array", () => {
      const voltages = [100, 110, 120, 115, 105]
      const stats = calculateWaveformStats(voltages)

      expect(stats.min).toBe(100)
      expect(stats.max).toBe(120)
      expect(stats.avg).toBe(110)
      expect(stats.latest).toBe(105)
      expect(stats.peakToPeak).toBe(20)
    })

    it("handles single value", () => {
      const stats = calculateWaveformStats([120])
      expect(stats.min).toBe(120)
      expect(stats.max).toBe(120)
      expect(stats.avg).toBe(120)
      expect(stats.rms).toBe(120)
      expect(stats.peakToPeak).toBe(0)
    })

    it("filters out non-finite values", () => {
      const voltages = [100, NaN, 120, Infinity, 110]
      const stats = calculateWaveformStats(voltages)
      expect(stats.min).toBe(100)
      expect(stats.max).toBe(120)
    })

    it("returns nulls for empty array", () => {
      const stats = calculateWaveformStats([])
      expect(stats.min).toBeNull()
      expect(stats.max).toBeNull()
      expect(stats.avg).toBeNull()
      expect(stats.rms).toBeNull()
      expect(stats.latest).toBeNull()
    })

    it("calculates RMS correctly", () => {
      const voltages = [0, 100]
      const stats = calculateWaveformStats(voltages)
      // RMS of [0, 100] = sqrt((0^2 + 100^2) / 2) = sqrt(5000) ≈ 70.71
      expect(stats.rms).toBeCloseTo(70.71, 1)
    })
  })

  describe("calculateWaveformYDomain", () => {
    it("returns [0, 1] for empty array", () => {
      expect(calculateWaveformYDomain([])).toEqual([0, 1])
    })

    it("adds padding to equal min/max", () => {
      const domain = calculateWaveformYDomain([100, 100, 100])
      expect(domain[0]).toBeLessThan(100)
      expect(domain[1]).toBeGreaterThan(100)
    })

    it("adds padding to different min/max", () => {
      const domain = calculateWaveformYDomain([100, 120])
      expect(domain[0]).toBeLessThan(100)
      expect(domain[1]).toBeGreaterThan(120)
    })

    it("filters out non-finite values", () => {
      const domain = calculateWaveformYDomain([100, NaN, 120, Infinity])
      expect(domain[0]).toBeLessThan(100)
      expect(domain[1]).toBeGreaterThan(120)
    })
  })
})
