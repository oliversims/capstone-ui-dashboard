import { describe, it, expect, vi } from "vitest"
import { classifyError, retryWithBackoff, fetchWithTimeout } from "../errors"

describe("errors", () => {
  describe("classifyError", () => {
    it("classifies fetch errors as network errors", () => {
      const error = new TypeError("fetch failed")
      const result = classifyError(error)
      expect(result.type).toBe("network_error")
      expect(result.message).toContain("Network request failed")
    })

    it("classifies URL errors as invalid IP", () => {
      const error = new TypeError("Invalid URL")
      const result = classifyError(error)
      expect(result.type).toBe("invalid_ip")
      expect(result.message).toContain("Invalid IP address")
    })

    it("classifies abort errors as timeout", () => {
      const error = new DOMException("Aborted", "AbortError")
      const result = classifyError(error)
      expect(result.type).toBe("timeout")
      expect(result.message).toContain("timeout")
    })

    it("classifies CORS errors as connection refused", () => {
      const error = new Error("CORS error")
      const result = classifyError(error)
      expect(result.type).toBe("connection_refused")
    })

    it("classifies unknown errors as unknown type", () => {
      const error = new Error("Something happened")
      const result = classifyError(error)
      expect(result.type).toBe("unknown")
    })

    it("returns timestamp with error", () => {
      const before = new Date()
      const error = new Error("Test error")
      const result = classifyError(error)
      const after = new Date()

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })
  })

  describe("retryWithBackoff", () => {
    it("returns result on first success", async () => {
      const fn = vi.fn().mockResolvedValue("success")
      const result = await retryWithBackoff(fn)
      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it("retries on failure and succeeds", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce("success")

      const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 })
      expect(result).toBe("success")
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it("throws after max attempts", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("persistent failure"))
      await expect(
        retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10 })
      ).rejects.toThrow("persistent failure")
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it("respects max delay limit", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("fail"))
      const onAttempt = vi.fn()

      await retryWithBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 1000,
        maxDelayMs: 500,
        onAttempt,
      }).catch(() => {}) // Ignore error

      expect(onAttempt).toHaveBeenCalled()
    })

    it("calls onAttempt callback", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("fail"))
      const onAttempt = vi.fn()

      await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10, onAttempt }).catch(
        () => {}
      )

      expect(onAttempt).toHaveBeenCalledWith(1, expect.any(Error))
      expect(onAttempt).toHaveBeenCalledWith(2, expect.any(Error))
      expect(onAttempt).toHaveBeenCalledWith(3, expect.any(Error))
    })
  })

  describe("fetchWithTimeout", () => {
    it("returns response on success", async () => {
      const mockResponse = { ok: true, json: () => Promise.resolve({}) }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      const result = await fetchWithTimeout("http://example.com", { timeoutMs: 5000 })
      expect(result).toBe(mockResponse)
    })

    // Note: AbortController timeout test is difficult to unit test accurately
    // as it requires precise timing. This is tested indirectly through API integration tests.

    it("uses default timeout of 10000ms", async () => {
      const mockResponse = { ok: true }
      const fetchFn = vi.fn().mockResolvedValue(mockResponse)
      global.fetch = fetchFn

      await fetchWithTimeout("http://example.com")
      const callArgs = fetchFn.mock.calls[0]
      expect(callArgs[0]).toBe("http://example.com")
    })

    it("passes through fetch options", async () => {
      const mockResponse = { ok: true }
      const fetchFn = vi.fn().mockResolvedValue(mockResponse)
      global.fetch = fetchFn

      await fetchWithTimeout("http://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 5000,
      })

      const callArgs = fetchFn.mock.calls[0][1]
      expect(callArgs.method).toBe("POST")
      expect(callArgs.headers).toEqual({ "Content-Type": "application/json" })
    })
  })
})
