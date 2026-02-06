/**
 * Temporal TUI - Terminal UI for Temporal workflow orchestration
 *
 * Entry point for the application
 */

import { createApp } from "./app";

async function main() {
  try {
    const app = await createApp();
    await app.run();
  } catch (error) {
    console.error("Failed to start Temporal TUI:", error);
    process.exit(1);
  }
}

main();
