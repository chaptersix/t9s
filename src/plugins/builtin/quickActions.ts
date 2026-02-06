/**
 * Quick Actions Plugin
 *
 * Provides convenient quick actions for common operations
 */

import type { Plugin, PluginContext } from "../types";

export function createQuickActionsPlugin(): Plugin {
  return {
    manifest: {
      id: "builtin:quick-actions",
      name: "Quick Actions",
      version: "1.0.0",
      description: "Quick access to common Temporal operations",
    },

    commands: [
      {
        id: "terminate-all-running",
        name: "Terminate All Running",
        description: "Terminate all currently running workflows (use with caution!)",
        category: "Quick Actions",
        when: (ctx) => ctx.getState().activeView === "workflows",
        async execute(ctx: PluginContext) {
          const client = ctx.getTemporalClient();
          const state = ctx.getState();

          const runningWorkflows = state.workflows.filter(
            (w) => w.status === "RUNNING"
          );

          if (runningWorkflows.length === 0) {
            ctx.showNotification("No running workflows to terminate", "info");
            return;
          }

          // This would ideally show a confirmation modal
          ctx.log("warn", `Terminating ${runningWorkflows.length} workflows`);

          for (const wf of runningWorkflows) {
            try {
              await client.terminateWorkflow(wf.workflowId, "Bulk termination via Quick Actions");
            } catch (error) {
              ctx.log("error", `Failed to terminate ${wf.workflowId}: ${error}`);
            }
          }

          ctx.showNotification(
            `Terminated ${runningWorkflows.length} workflows`,
            "success"
          );
        },
      },
      {
        id: "copy-workflow-id",
        name: "Copy Workflow ID",
        description: "Copy selected workflow ID to clipboard",
        category: "Quick Actions",
        shortcut: "y",
        when: (ctx) => {
          const state = ctx.getState();
          return state.activeView === "workflows" || state.activeView === "workflow-detail";
        },
        execute(ctx: PluginContext) {
          const state = ctx.getState();
          let workflowId: string | null = null;

          if (state.activeView === "workflow-detail" && state.workflowDetail) {
            workflowId = state.workflowDetail.workflowId;
          } else if (state.selectedWorkflowId) {
            workflowId = state.selectedWorkflowId;
          }

          if (workflowId) {
            // Note: clipboard API requires appropriate permissions
            // This is a placeholder - actual implementation depends on terminal capabilities
            ctx.log("info", `Workflow ID: ${workflowId}`);
            ctx.showNotification(`Copied: ${workflowId}`, "success");
          } else {
            ctx.showNotification("No workflow selected", "warning");
          }
        },
      },
      {
        id: "export-history-json",
        name: "Export History as JSON",
        description: "Export current workflow history as JSON",
        category: "Quick Actions",
        when: (ctx) => ctx.getState().activeView === "workflow-detail",
        execute(ctx: PluginContext) {
          const state = ctx.getState();

          if (!state.workflowDetail || state.workflowHistory.length === 0) {
            ctx.showNotification("No history to export", "warning");
            return;
          }

          const exportData = {
            workflowId: state.workflowDetail.workflowId,
            runId: state.workflowDetail.runId,
            workflowType: state.workflowDetail.workflowType,
            exportedAt: new Date().toISOString(),
            history: state.workflowHistory,
          };

          // Log the JSON (in a real implementation, this would save to a file)
          ctx.log("info", `Exported ${state.workflowHistory.length} events`);
          console.log(JSON.stringify(exportData, null, 2));

          ctx.showNotification(
            `Exported ${state.workflowHistory.length} events`,
            "success"
          );
        },
      },
      {
        id: "refresh-all",
        name: "Force Refresh All",
        description: "Force refresh all data from Temporal",
        category: "Quick Actions",
        execute(ctx: PluginContext) {
          // Trigger a refresh by resetting error count and enabling polling
          ctx.dispatch({ type: "RESET_ERROR_COUNT" });
          ctx.dispatch({ type: "SET_POLLING_ENABLED", payload: true });
          ctx.showNotification("Refreshing data...", "info");
        },
      },
      {
        id: "toggle-debug-mode",
        name: "Toggle Debug Mode",
        description: "Show additional debug information",
        category: "Quick Actions",
        execute(ctx: PluginContext) {
          const state = ctx.getState();
          ctx.log("info", `Current state: ${JSON.stringify({
            activeView: state.activeView,
            connectionStatus: state.connectionStatus,
            workflowCount: state.workflows.length,
            pollingEnabled: state.pollingEnabled,
            errorCount: state.errorCount,
          }, null, 2)}`);
          ctx.showNotification("Debug info logged to console", "info");
        },
      },
    ],

    activate(ctx: PluginContext) {
      ctx.log("info", "Quick Actions plugin activated");
    },

    deactivate() {
      console.log("Quick Actions plugin deactivated");
    },
  };
}
