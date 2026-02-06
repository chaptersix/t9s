/**
 * Debug script to trace data flow
 */

import { createTemporalClient } from "../src/data/temporal/client";
import { createStore } from "../src/store";

async function debugFlow() {
  console.log("=== Debug Data Flow ===\n");

  // 1. Create client
  console.log("1. Creating Temporal client...");
  const client = createTemporalClient({
    baseUrl: "http://localhost:8233",
    namespace: "default",
  });

  // 2. Test connection
  console.log("2. Testing connection...");
  const connected = await client.testConnection();
  console.log(`   Connected: ${connected}`);

  // 3. Create store
  console.log("3. Creating store...");
  const store = createStore();
  console.log(`   Initial workflows: ${store.getState().workflows.length}`);

  // 4. Subscribe to store changes
  store.subscribe((state, prevState) => {
    if (state.workflows !== prevState.workflows) {
      console.log(`   [Store] Workflows updated: ${state.workflows.length} workflows`);
    }
    if (state.error !== prevState.error) {
      console.log(`   [Store] Error: ${state.error}`);
    }
  });

  // 5. Load workflows
  console.log("4. Loading workflows...");
  try {
    const result = await client.listWorkflows({ pageSize: 10 });
    console.log(`   API returned: ${result.items.length} workflows`);

    if (result.items.length > 0) {
      console.log("   Sample workflow:");
      const first = result.items[0];
      console.log(`     - ID: ${first?.workflowId}`);
      console.log(`     - Type: ${first?.workflowType}`);
      console.log(`     - Status: ${first?.status}`);
    }

    // 6. Dispatch to store
    console.log("5. Dispatching to store...");
    store.dispatch({ type: "SET_WORKFLOWS", payload: result.items });
    console.log(`   Store workflows: ${store.getState().workflows.length}`);

    // 7. Verify store data
    console.log("6. Verifying store data...");
    const workflows = store.getState().workflows;
    if (workflows.length > 0) {
      console.log("   First workflow in store:");
      console.log(`     - ID: ${workflows[0]?.workflowId}`);
      console.log(`     - Type: ${workflows[0]?.workflowType}`);
    }

  } catch (error) {
    console.error("   ERROR:", error);
  }

  console.log("\n=== Debug Complete ===");
}

debugFlow();
