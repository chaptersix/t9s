/**
 * Error Handling Unit Tests
 */

import { describe, test, expect } from "bun:test";
import {
  TemporalApiError,
  isTemporalApiError,
  getErrorMessage,
  getUserFriendlyError,
  formatErrorForStatusBar,
} from "../errors";

describe("Error Handling", () => {
  describe("TemporalApiError", () => {
    test("creates error with message and status code", () => {
      const error = new TemporalApiError("Not found", 404);

      expect(error.message).toBe("Not found");
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe("TemporalApiError");
    });

    test("determines category from status code", () => {
      expect(new TemporalApiError("", 0).category).toBe("connection");
      expect(new TemporalApiError("", 401).category).toBe("auth");
      expect(new TemporalApiError("", 403).category).toBe("auth");
      expect(new TemporalApiError("", 404).category).toBe("not_found");
      expect(new TemporalApiError("", 400).category).toBe("validation");
      expect(new TemporalApiError("", 408).category).toBe("timeout");
      expect(new TemporalApiError("", 504).category).toBe("timeout");
      expect(new TemporalApiError("", 500).category).toBe("server");
      expect(new TemporalApiError("", 502).category).toBe("server");
      expect(new TemporalApiError("", 418).category).toBe("unknown");
    });

    test("isNotFound returns true for 404", () => {
      expect(new TemporalApiError("", 404).isNotFound).toBe(true);
      expect(new TemporalApiError("", 500).isNotFound).toBe(false);
    });

    test("isUnauthorized returns true for 401", () => {
      expect(new TemporalApiError("", 401).isUnauthorized).toBe(true);
      expect(new TemporalApiError("", 403).isUnauthorized).toBe(false);
    });

    test("isForbidden returns true for 403", () => {
      expect(new TemporalApiError("", 403).isForbidden).toBe(true);
      expect(new TemporalApiError("", 401).isForbidden).toBe(false);
    });

    test("isServerError returns true for 5xx", () => {
      expect(new TemporalApiError("", 500).isServerError).toBe(true);
      expect(new TemporalApiError("", 502).isServerError).toBe(true);
      expect(new TemporalApiError("", 503).isServerError).toBe(true);
      expect(new TemporalApiError("", 400).isServerError).toBe(false);
    });

    test("isConnectionError returns true for status 0", () => {
      expect(new TemporalApiError("", 0).isConnectionError).toBe(true);
      expect(new TemporalApiError("", 500).isConnectionError).toBe(false);
    });

    test("isRetryable identifies retryable errors", () => {
      expect(new TemporalApiError("", 0).isRetryable).toBe(true); // connection
      expect(new TemporalApiError("", 408).isRetryable).toBe(true); // timeout
      expect(new TemporalApiError("", 500).isRetryable).toBe(true); // server
      expect(new TemporalApiError("", 404).isRetryable).toBe(false); // not found
      expect(new TemporalApiError("", 401).isRetryable).toBe(false); // auth
    });
  });

  describe("isTemporalApiError", () => {
    test("returns true for TemporalApiError", () => {
      const error = new TemporalApiError("test", 500);
      expect(isTemporalApiError(error)).toBe(true);
    });

    test("returns false for regular Error", () => {
      const error = new Error("test");
      expect(isTemporalApiError(error)).toBe(false);
    });

    test("returns false for non-error values", () => {
      expect(isTemporalApiError("string")).toBe(false);
      expect(isTemporalApiError(null)).toBe(false);
      expect(isTemporalApiError(undefined)).toBe(false);
      expect(isTemporalApiError({})).toBe(false);
    });
  });

  describe("getErrorMessage", () => {
    test("extracts message from TemporalApiError", () => {
      const error = new TemporalApiError("API error message", 500);
      expect(getErrorMessage(error)).toBe("API error message");
    });

    test("extracts message from regular Error", () => {
      const error = new Error("Regular error");
      expect(getErrorMessage(error)).toBe("Regular error");
    });

    test("converts non-error to string", () => {
      expect(getErrorMessage("string error")).toBe("string error");
      expect(getErrorMessage(42)).toBe("42");
      expect(getErrorMessage(null)).toBe("null");
    });
  });

  describe("getUserFriendlyError", () => {
    test("returns friendly message for connection error", () => {
      const error = new TemporalApiError("Network failed", 0);
      const friendly = getUserFriendlyError(error);

      expect(friendly.title).toBe("Connection Failed");
      expect(friendly.message).toContain("Unable to connect");
      expect(friendly.suggestion).toBeDefined();
    });

    test("returns friendly message for auth errors", () => {
      const unauthorized = new TemporalApiError("", 401);
      const forbidden = new TemporalApiError("", 403);

      expect(getUserFriendlyError(unauthorized).title).toBe("Authentication Error");
      expect(getUserFriendlyError(forbidden).title).toBe("Authentication Error");
    });

    test("returns friendly message for not found", () => {
      const error = new TemporalApiError("Workflow not found", 404);
      const friendly = getUserFriendlyError(error);

      expect(friendly.title).toBe("Not Found");
      expect(friendly.message).toBe("Workflow not found");
    });

    test("returns friendly message for validation error", () => {
      const error = new TemporalApiError("Invalid query", 400);
      const friendly = getUserFriendlyError(error);

      expect(friendly.title).toBe("Invalid Request");
    });

    test("returns friendly message for timeout", () => {
      const error = new TemporalApiError("", 408);
      const friendly = getUserFriendlyError(error);

      expect(friendly.title).toBe("Request Timeout");
    });

    test("returns friendly message for server error", () => {
      const error = new TemporalApiError("Internal error", 500);
      const friendly = getUserFriendlyError(error);

      expect(friendly.title).toBe("Server Error");
    });

    test("handles network TypeError", () => {
      const error = new TypeError("fetch failed");
      const friendly = getUserFriendlyError(error);

      expect(friendly.title).toBe("Network Error");
    });

    test("handles regular Error", () => {
      const error = new Error("Something went wrong");
      const friendly = getUserFriendlyError(error);

      expect(friendly.title).toBe("Error");
      expect(friendly.message).toBe("Something went wrong");
    });

    test("handles unknown values", () => {
      const friendly = getUserFriendlyError("string error");

      expect(friendly.title).toBe("Unknown Error");
      expect(friendly.message).toBe("string error");
    });
  });

  describe("formatErrorForStatusBar", () => {
    test("formats error for compact display", () => {
      const error = new TemporalApiError("Workflow not found", 404);
      const formatted = formatErrorForStatusBar(error);

      expect(formatted).toBe("Not Found: Workflow not found");
    });

    test("handles connection errors", () => {
      const error = new TemporalApiError("", 0);
      const formatted = formatErrorForStatusBar(error);

      expect(formatted).toContain("Connection Failed");
    });
  });
});
