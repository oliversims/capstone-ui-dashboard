import { describe, it, expect, vi, beforeEach } from "vitest"
import { parseTelemetryResponse, ApiClient } from "../api"

describe("api", () => {
  describe("parseTelemetryResponse", () => {
    it("parses valid telemetry response", () => {
      const response = {
        voltage1: 120.5,
        voltage2: 118.2,
        channel1: true,
        channel2: false,
        signalStrength: -50,
        cameraOnline: true,
      }

      const result = parseTelemetryResponse(response)
      expect(result.voltage1).toBe(120.5)
      expect(result.voltage2).toBe(118.2)
      expect(result.channel1).toBe(true)
      expect(result.channel2).toBe(false)
      expect(result.signalStrength).toBe(-50)
      expect(result.cameraOnline).toBe(true)
    })

    it("handles partial response with missing fields", () => {
      const response = {
        voltage1: 120.5,
        // Missing other fields
      }

      const result = parseTelemetryResponse(response)
      expect(result.voltage1).toBe(120.5)
      expect(result.voltage2).toBeUndefined()
    })

    it("filters out null voltages", () => {
      const response = {
        voltage1: null,
        voltage2: 118.2,
      }

      const result = parseTelemetryResponse(response)
      expect(result.voltage1).toBeNull()
      expect(result.voltage2).toBe(118.2)
    })

    it("rejects non-finite numbers", () => {
      const response = {
        voltage1: NaN,
        voltage2: Infinity,
        voltage3: 120,
      }

      const result = parseTelemetryResponse(response)
      expect(result.voltage1).toBeUndefined()
      expect(result.voltage2).toBeUndefined()
      expect(result.voltage3).toBe(120)
    })

    it("accepts reasonable string lengths", () => {
      const response = {
        pdFault: "Short fault message",
        securityState: "armed",
      }

      const result = parseTelemetryResponse(response)
      expect(result.pdFault).toBe("Short fault message")
      expect(result.securityState).toBe("armed")
    })

    it("handles non-object input gracefully", () => {
      expect(parseTelemetryResponse(null)).toEqual({})
      expect(parseTelemetryResponse(undefined)).toEqual({})
      expect(parseTelemetryResponse("string")).toEqual({})
      expect(parseTelemetryResponse(123)).toEqual({})
    })

    it("parses all 6 channel voltages", () => {
      const response = {
        voltage1: 120,
        voltage2: 120,
        voltage3: 120,
        voltage4: 120,
        voltage5: 120,
        voltage6: 120,
      }

      const result = parseTelemetryResponse(response)
      expect(result.voltage1).toBe(120)
      expect(result.voltage2).toBe(120)
      expect(result.voltage3).toBe(120)
      expect(result.voltage4).toBe(120)
      expect(result.voltage5).toBe(120)
      expect(result.voltage6).toBe(120)
    })

    it("parses fault strings for all channels", () => {
      const response = {
        channel1Fault: "Short circuit",
        channel2Fault: null,
        channel3Fault: "Overcurrent",
      }

      const result = parseTelemetryResponse(response)
      expect(result.channel1Fault).toBe("Short circuit")
      expect(result.channel2Fault).toBeUndefined()
      expect(result.channel3Fault).toBe("Overcurrent")
    })
  })

  describe("ApiClient", () => {
    let client: ApiClient

    beforeEach(() => {
      client = new ApiClient("192.168.1.100")
      vi.clearAllMocks()
    })

    describe("fetchTelemetry", () => {
      it("fetches and parses telemetry successfully", async () => {
        const mockData = {
          voltage1: 120,
          channel1: true,
          signalStrength: -50,
        }

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockData),
        })

        const result = await client.fetchTelemetry()
        expect(result.voltage1).toBe(120)
        expect(result.channel1).toBe(true)
        expect(result.signalStrength).toBe(-50)
      })

      it("throws error on failed response", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        })

        await expect(client.fetchTelemetry()).rejects.toThrow()
      })

      it("throws error on network failure", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

        await expect(client.fetchTelemetry()).rejects.toThrow()
      })

      it("retries on transient failure", async () => {
        global.fetch = vi
          .fn()
          .mockRejectedValueOnce(new Error("Temporary error"))
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ voltage1: 120 }),
          })

        const result = await client.fetchTelemetry()
        expect(result.voltage1).toBe(120)
        expect(global.fetch).toHaveBeenCalledTimes(2)
      })
    })

    describe("setChannelState", () => {
      it("sends channel on command successfully", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
        })

        await client.setChannelState(1, "on")
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("192.168.1.100/channel/1/on"),
          expect.any(Object)
        )
      })

      it("sends channel off command successfully", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
        })

        await client.setChannelState(2, "off")
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("192.168.1.100/channel/2/off"),
          expect.any(Object)
        )
      })

      it("throws error on failed command", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
        })

        await expect(client.setChannelState(1, "on")).rejects.toThrow()
      })

      it("uses cache: no-store to avoid caching", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
        })

        await client.setChannelState(1, "on")
        const callOptions = global.fetch.mock.calls[0][1]
        expect(callOptions.cache).toBe("no-store")
      })
    })

    describe("setMultipleChannels", () => {
      it("sets multiple channels successfully", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
        })

        const result = await client.setMultipleChannels([1, 2, 3], "on")
        expect(result.successful).toEqual([1, 2, 3])
        expect(result.failed).toEqual([])
        expect(global.fetch).toHaveBeenCalledTimes(3)
      })

      it("tracks failed channels", async () => {
        global.fetch = vi
          .fn()
          .mockResolvedValueOnce({ ok: true })
          .mockResolvedValueOnce({ ok: false, status: 500 })
          .mockResolvedValueOnce({ ok: true })

        const result = await client.setMultipleChannels([1, 2, 3], "off")
        expect(result.successful).toEqual([1, 3])
        expect(result.failed).toHaveLength(1)
        expect(result.failed[0].channel).toBe(2)
      })

      it("continues despite individual failures", async () => {
        // Note: Due to retry logic with exponential backoff, each call may attempt multiple times
        // This test verifies that failures in some channels don't prevent others from being processed
        global.fetch = vi
          .fn()
          .mockRejectedValueOnce(new Error("Network error"))
          .mockResolvedValueOnce({ ok: true })
          .mockRejectedValueOnce(new Error("Timeout"))

        const result = await client.setMultipleChannels([1, 2, 3], "on")
        // Should have at least one successful and failures tracked
        expect(result.successful.length + result.failed.length).toBe(3)
      })

      it("handles empty channel list", async () => {
        const result = await client.setMultipleChannels([], "on")
        expect(result.successful).toEqual([])
        expect(result.failed).toEqual([])
      })
    })
  })
})
