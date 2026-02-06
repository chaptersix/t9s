/**
 * Temporal API error handling
 */

export type ErrorCategory =
  | "connection"
  | "auth"
  | "not_found"
  | "server"
  | "validation"
  | "timeout"
  | "unknown";

export class TemporalApiError extends Error {
  public readonly category: ErrorCategory;

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = "TemporalApiError";
    this.category = this.determineCategory();
  }

  private determineCategory(): ErrorCategory {
    if (this.statusCode === 0) return "connection";
    if (this.statusCode === 401) return "auth";
    if (this.statusCode === 403) return "auth";
    if (this.statusCode === 404) return "not_found";
    if (this.statusCode === 400) return "validation";
    if (this.statusCode === 408 || this.statusCode === 504) return "timeout";
    if (this.statusCode >= 500) return "server";
    return "unknown";
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }

  get isConnectionError(): boolean {
    return this.statusCode === 0;
  }

  get isRetryable(): boolean {
    return (
      this.category === "connection" ||
      this.category === "timeout" ||
      this.category === "server"
    );
  }
}

export function isTemporalApiError(error: unknown): error is TemporalApiError {
  return error instanceof TemporalApiError;
}

/**
 * Get a raw error message (for logging/debugging)
 */
export function getErrorMessage(error: unknown): string {
  if (isTemporalApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Get a user-friendly error message suitable for display
 */
export function getUserFriendlyError(error: unknown): {
  title: string;
  message: string;
  suggestion?: string;
} {
  if (isTemporalApiError(error)) {
    switch (error.category) {
      case "connection":
        return {
          title: "Connection Failed",
          message: "Unable to connect to Temporal server",
          suggestion: "Check that the Temporal server is running at localhost:8233",
        };
      case "auth":
        return {
          title: "Authentication Error",
          message: error.isUnauthorized
            ? "Invalid or missing credentials"
            : "You don't have permission to perform this action",
          suggestion: "Check your API key or authentication settings",
        };
      case "not_found":
        return {
          title: "Not Found",
          message: error.message || "The requested resource was not found",
          suggestion: "The workflow or resource may have been deleted",
        };
      case "validation":
        return {
          title: "Invalid Request",
          message: error.message || "The request was invalid",
          suggestion: "Check the input values and try again",
        };
      case "timeout":
        return {
          title: "Request Timeout",
          message: "The request took too long to complete",
          suggestion: "The server may be under heavy load. Try again later",
        };
      case "server":
        return {
          title: "Server Error",
          message: "The Temporal server encountered an error",
          suggestion: "Check the server logs for more details",
        };
      default:
        return {
          title: "Error",
          message: error.message || "An unexpected error occurred",
        };
    }
  }

  // Handle network errors
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return {
      title: "Network Error",
      message: "Unable to reach the Temporal server",
      suggestion: "Check your network connection and server availability",
    };
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      title: "Error",
      message: error.message,
    };
  }

  return {
    title: "Unknown Error",
    message: String(error),
  };
}

/**
 * Format error for status bar display (short form)
 */
export function formatErrorForStatusBar(error: unknown): string {
  const friendly = getUserFriendlyError(error);
  return `${friendly.title}: ${friendly.message}`;
}
