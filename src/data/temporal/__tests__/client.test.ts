/**
 * Temporal Client Unit Tests
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, mock } from "bun:test";
import { createTemporalClient } from "../client";

describe("Temporal Client", () => {
  // Mock fetch for each test
  function setupMockFetch() {
    const mockFetch = mock(() => Promise.resolve(new Response()));
    // @ts-expect-error - mocking global fetch
    globalThis.fetch = mockFetch;
    return mockFetch;
  }

  describe("listWorkflows", () => {
    test("transforms raw API response correctly", async () => {
      const mockFetch = setupMockFetch();
      const rawResponse = {
        executions: [
          {
            execution: {
              workflowId: "order-12345",
              runId: "run-abc",
            },
            type: {
              name: "OrderWorkflow",
            },
            status: "WORKFLOW_EXECUTION_STATUS_RUNNING",
            startTime: "2026-02-06T02:46:38.082Z",
            taskQueue: "seed-task-queue",
            historyLength: "10",
            memo: {},
          },
          {
            execution: {
              workflowId: "payment-xyz",
              runId: "run-def",
            },
            type: {
              name: "PaymentWorkflow",
            },
            status: "WORKFLOW_EXECUTION_STATUS_COMPLETED",
            startTime: "2026-02-06T01:00:00.000Z",
            closeTime: "2026-02-06T01:05:00.000Z",
            taskQueue: "payment-queue",
          },
        ],
        nextPageToken: "token123",
      };

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(rawResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "default",
      });

      const result = await client.listWorkflows();

      expect(result.items).toHaveLength(2);
      expect(result.nextPageToken).toBe("token123");

      // Check first workflow transformation
      const first = result.items[0];
      expect(first?.workflowId).toBe("order-12345");
      expect(first?.runId).toBe("run-abc");
      expect(first?.workflowType).toBe("OrderWorkflow");
      expect(first?.status).toBe("RUNNING");
      expect(first?.taskQueue).toBe("seed-task-queue");
      expect(first?.historyLength).toBe(10);

      // Check second workflow transformation
      const second = result.items[1];
      expect(second?.workflowId).toBe("payment-xyz");
      expect(second?.status).toBe("COMPLETED");
      expect(second?.closeTime).toBe("2026-02-06T01:05:00.000Z");
    });

    test("handles empty response", async () => {
      const mockFetch = setupMockFetch();
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ executions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "default",
      });

      const result = await client.listWorkflows();

      expect(result.items).toHaveLength(0);
      expect(result.nextPageToken).toBeUndefined();
    });

    test("builds query string correctly", async () => {
      const mockFetch = setupMockFetch();
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ executions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "test-ns",
      });

      await client.listWorkflows({
        query: 'WorkflowType="OrderWorkflow"',
        pageSize: 25,
        pageToken: "abc123",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calls = mockFetch.mock.calls as any[];
      const url = calls[0][0] as string;
      expect(url).toContain("/api/v1/namespaces/test-ns/workflows");
      expect(url).toContain("query=");
      expect(url).toContain("pageSize=25");
      expect(url).toContain("nextPageToken=abc123");
    });

    test("uses GET method", async () => {
      const mockFetch = setupMockFetch();
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ executions: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "default",
      });

      await client.listWorkflows();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calls = mockFetch.mock.calls as any[];
      const options = calls[0][1] as RequestInit;
      expect(options.method).toBe("GET");
    });
  });

  describe("testConnection", () => {
    test("returns true when server responds", async () => {
      const mockFetch = setupMockFetch();
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ version: "1.0.0" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "default",
      });

      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    test("returns false when server fails", async () => {
      const mockFetch = setupMockFetch();
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "default",
      });

      const result = await client.testConnection();
      expect(result).toBe(false);
    });
  });

  describe("cancelWorkflow", () => {
    test("fetches CSRF token before POST", async () => {
      const mockFetch = setupMockFetch();
      // First call - fetch CSRF token
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "_csrf=test-token-123; Path=/",
          },
        })
      );

      // Second call - cancel workflow
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "default",
      });

      await client.cancelWorkflow("my-workflow");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const calls = mockFetch.mock.calls as any[];

      // Check CSRF token fetch
      expect(calls[0][0]).toContain("/api/v1/settings");

      // Check cancel request includes CSRF token
      const cancelUrl = calls[1][0] as string;
      const cancelOptions = calls[1][1] as RequestInit;
      expect(cancelUrl).toContain("/workflows/my-workflow/cancel");
      expect(cancelOptions.method).toBe("POST");
      expect((cancelOptions.headers as Record<string, string>)["X-CSRF-Token"]).toBe("test-token-123");
    });
  });

  describe("terminateWorkflow", () => {
    test("sends reason in body", async () => {
      const mockFetch = setupMockFetch();
      // CSRF token fetch
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "_csrf=token; Path=/",
          },
        })
      );

      // Terminate request
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const client = createTemporalClient({
        baseUrl: "http://localhost:8233",
        namespace: "default",
      });

      await client.terminateWorkflow("my-workflow", "Test termination");

      const calls = mockFetch.mock.calls as any[];
      const terminateOptions = calls[1][1] as RequestInit;
      expect(terminateOptions.body).toBe(JSON.stringify({ reason: "Test termination" }));
    });
  });
});
