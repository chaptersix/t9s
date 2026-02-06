/**
 * Application initialization and main loop
 */

import { createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core";
import type { AppConfig } from "./config";
import { getDefaultConfig } from "./config";
import { createStore, type Store } from "./store";
import { createTemporalClient, type TemporalClient } from "./data/temporal/client";
import { Shell } from "./components/layout";
import { ConfirmModal, type ConfirmationType, CommandPalette, type Command, HelpOverlay, ErrorToast, NamespaceSelector } from "./components/overlay";
// Error utilities available for enhanced error display
// import { getUserFriendlyError, formatErrorForStatusBar } from "./data/temporal/errors";
import { createKeyHandler, type KeyContext, type KeyAction } from "./input";
import { WorkflowList, WorkflowDetail } from "./views/workflows";
import { ScheduleList, ScheduleDetail } from "./views/schedules";
import { loadSavedViews, addSavedView, type SavedView } from "./config/savedViews";
import {
  createPluginManager,
  type PluginManager,
  createQuickActionsPlugin,
  createPluginContext,
} from "./plugins";

// Active view references for navigation
let activeWorkflowList: WorkflowList | null = null;
let activeWorkflowDetail: WorkflowDetail | null = null;
let activeScheduleList: ScheduleList | null = null;
let activeScheduleDetail: ScheduleDetail | null = null;
let pluginManager: PluginManager | null = null;
let currentShell: Shell | null = null;
let currentClient: TemporalClient | null = null;
let currentStore: Store | null = null;
let activeModal: ConfirmModal | null = null;
let commandPalette: CommandPalette | null = null;
let helpOverlay: HelpOverlay | null = null;
let errorToast: ErrorToast | null = null;
let namespaceSelector: NamespaceSelector | null = null;

export interface App {
  run(): Promise<void>;
  stop(): Promise<void>;
}

export async function createApp(config?: Partial<AppConfig>): Promise<App> {
  const appConfig = { ...getDefaultConfig(), ...config };

  // Initialize store
  const store = createStore();

  // Load saved views
  const savedViewsConfig = loadSavedViews();
  store.dispatch({ type: "SET_SAVED_VIEWS", payload: savedViewsConfig.views });

  // Initialize Temporal client
  const temporalClient = createTemporalClient({
    baseUrl: appConfig.temporalUiServerUrl,
    namespace: appConfig.namespace,
  });

  // Test connection and update store
  const connected = await temporalClient.testConnection();
  store.dispatch({
    type: "SET_CONNECTION_STATUS",
    payload: connected ? "connected" : "disconnected",
  });

  // Fetch namespaces on successful connection
  if (connected) {
    try {
      const namespaces = await temporalClient.listNamespaces();
      store.dispatch({ type: "SET_NAMESPACES", payload: namespaces });
    } catch {
      // Non-fatal, continue with empty namespace list
    }
  }

  // Initialize plugin system
  pluginManager = createPluginManager({
    store,
    client: temporalClient,
  });

  // Register built-in plugins
  pluginManager.registerBuiltin(createQuickActionsPlugin());

  // Initialize all plugins
  await pluginManager.initialize();

  let renderer: CliRenderer | null = null;
  let shell: Shell | null = null;

  return {
    async run() {
      // Initialize OpenTUI renderer
      renderer = await createCliRenderer({
        exitOnCtrlC: false, // We'll handle quit ourselves
        useAlternateScreen: true,
        useMouse: true,
        backgroundColor: "#0f0f23",
      });

      // Create shell layout
      shell = new Shell(renderer, {
        store,
      });

      // Add shell to renderer root
      renderer.root.add(shell);

      // Store references for view management
      currentShell = shell;
      currentClient = temporalClient;
      currentStore = store;

      // Create and set initial view (workflow list)
      activeWorkflowList = new WorkflowList(renderer, {
        store,
        onSelectWorkflow: async (workflow) => {
          if (renderer) {
            await navigateToWorkflowDetail(renderer, workflow.workflowId, workflow.runId);
          }
        },
        onFilterChange: async () => {
          // Reload workflows with new filters
          await loadWorkflows(store, temporalClient);
        },
      });
      shell.setContent(activeWorkflowList);

      // Set up global key handlers
      setupKeyHandlers(renderer, store, temporalClient, shell);

      // Start the renderer
      renderer.start();

      // Subscribe to errors and show toast
      store.subscribe((state, prevState) => {
        if (state.error && state.error !== prevState.error) {
          showErrorToast(renderer!, state.error);
        }
      });

      // Start polling for data if connected
      if (connected) {
        startPolling(store, temporalClient);
      }

      // Wait for renderer to be destroyed
      await new Promise<void>((resolve) => {
        renderer!.on("destroy", () => {
          resolve();
        });
      });
    },

    async stop() {
      if (renderer && !renderer.isDestroyed) {
        renderer.destroy();
      }
    },
  };
}

function setupKeyHandlers(
  renderer: CliRenderer,
  store: Store,
  client: TemporalClient,
  shell: Shell
): void {
  const keyHandler = createKeyHandler();

  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // Handle error toast keys first (Escape to dismiss)
    if (errorToast) {
      const handled = errorToast.handleKey(key.name);
      if (handled) return;
    }

    // Handle help overlay keys first
    if (helpOverlay) {
      const handled = helpOverlay.handleKey(key.name);
      if (handled) return;
    }

    // Handle command palette keys
    if (commandPalette) {
      const handled = commandPalette.handleKey(key.name);
      if (handled) return;
    }

    // Handle modal keys
    if (activeModal) {
      const handled = activeModal.handleKey(key.name);
      if (handled) return;
    }

    // Handle search mode in workflow list
    if (activeWorkflowList?.isInSearchMode()) {
      const handled = activeWorkflowList.handleSearchKey(key.name);
      if (handled) return;
    }

    // Determine current context
    const state = store.getState();
    let context: KeyContext = state.activeView;

    if (state.commandPaletteOpen) {
      context = "command-palette";
    }

    // Process key through handler
    const action = keyHandler.handleKey(key, context);

    if (action) {
      handleKeyAction(action, renderer, store, shell, client);
    }
  });
}

function handleKeyAction(
  action: KeyAction,
  renderer: CliRenderer,
  store: Store,
  _shell: Shell,
  client: TemporalClient
): void {
  switch (action.type) {
    case "QUIT":
      renderer.destroy();
      break;

    case "SWITCH_VIEW": {
      const view = action.payload as "workflows" | "schedules" | "task-queues";
      if (view === "schedules") {
        navigateToScheduleList(renderer);
      } else if (view === "workflows") {
        navigateToWorkflowList(renderer);
      } else {
        store.dispatch({ type: "SET_ACTIVE_VIEW", payload: view });
      }
      break;
    }

    case "TOGGLE_NAMESPACE_SELECTOR":
      if (namespaceSelector) {
        closeNamespaceSelector(renderer, store);
      } else {
        showNamespaceSelector(renderer, store, client);
      }
      break;

    case "TOGGLE_COMMAND_PALETTE":
      if (commandPalette) {
        closeCommandPalette(renderer, store);
      } else {
        showCommandPalette(renderer, store, client);
      }
      break;

    case "BACK":
      if (activeModal) {
        closeModal(renderer);
      } else if (namespaceSelector) {
        closeNamespaceSelector(renderer, store);
      } else if (store.getState().commandPaletteOpen) {
        store.dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
      } else if (store.getState().activeView === "workflow-detail") {
        navigateToWorkflowList(renderer);
      } else if (store.getState().activeView === "schedule-detail") {
        navigateToScheduleList(renderer);
      }
      break;

    case "REFRESH":
      refreshCurrentView(store, client);
      break;

    case "HELP":
      if (helpOverlay) {
        closeHelpOverlay(renderer, store);
      } else {
        showHelpOverlay(renderer, store);
      }
      break;

    // Navigation actions - route to active view
    case "MOVE_UP":
      if (activeWorkflowList) activeWorkflowList.moveUp();
      if (activeWorkflowDetail) {
        if (activeWorkflowDetail.isOnPendingTab()) {
          activeWorkflowDetail.selectPrevActivity();
        } else {
          activeWorkflowDetail.scrollUp();
        }
      }
      if (activeScheduleList) activeScheduleList.moveUp();
      if (activeScheduleDetail) activeScheduleDetail.scrollUp();
      break;
    case "MOVE_DOWN":
      if (activeWorkflowList) activeWorkflowList.moveDown();
      if (activeWorkflowDetail) {
        if (activeWorkflowDetail.isOnPendingTab()) {
          activeWorkflowDetail.selectNextActivity();
        } else {
          activeWorkflowDetail.scrollDown();
        }
      }
      if (activeScheduleList) activeScheduleList.moveDown();
      if (activeScheduleDetail) activeScheduleDetail.scrollDown();
      break;
    case "MOVE_TO_TOP":
      if (activeWorkflowList) activeWorkflowList.moveToTop();
      if (activeScheduleList) activeScheduleList.moveToTop();
      break;
    case "MOVE_TO_BOTTOM":
      if (activeWorkflowList) activeWorkflowList.moveToBottom();
      if (activeScheduleList) activeScheduleList.moveToBottom();
      break;
    case "PAGE_UP":
      if (activeWorkflowList) activeWorkflowList.pageUp();
      if (activeWorkflowDetail) activeWorkflowDetail.pageUp();
      if (activeScheduleList) activeScheduleList.pageUp();
      if (activeScheduleDetail) activeScheduleDetail.pageUp();
      break;
    case "PAGE_DOWN":
      if (activeWorkflowList) activeWorkflowList.pageDown();
      if (activeWorkflowDetail) activeWorkflowDetail.pageDown();
      if (activeScheduleList) activeScheduleList.pageDown();
      if (activeScheduleDetail) activeScheduleDetail.pageDown();
      break;
    case "SELECT":
      if (activeWorkflowList) activeWorkflowList.select();
      if (activeScheduleList) activeScheduleList.select();
      break;

    case "MOVE_LEFT":
    case "PREV_TAB":
      if (activeWorkflowDetail) activeWorkflowDetail.prevTab();
      if (activeScheduleDetail) activeScheduleDetail.prevTab();
      break;
    case "MOVE_RIGHT":
    case "NEXT_TAB":
      if (activeWorkflowDetail) activeWorkflowDetail.nextTab();
      if (activeScheduleDetail) activeScheduleDetail.nextTab();
      break;
    case "TOGGLE_VIEW_MODE":
      if (activeWorkflowDetail) activeWorkflowDetail.toggleHistoryViewMode();
      break;

    // Workflow actions
    case "CANCEL_WORKFLOW":
      showWorkflowActionModal(renderer, store, client, "cancel");
      break;
    case "TERMINATE_WORKFLOW":
      showWorkflowActionModal(renderer, store, client, "terminate");
      break;
    case "SIGNAL_WORKFLOW":
    case "QUERY_WORKFLOW":
    case "RESET_WORKFLOW":
      // TODO: Implement these workflow actions
      break;

    // Schedule actions
    case "TOGGLE_SCHEDULE":
      if (activeScheduleList) {
        activeScheduleList.toggleSelected();
      } else if (activeScheduleDetail && store.getState().scheduleDetail) {
        toggleScheduleFromDetail(store, client, store.getState().scheduleDetail!);
      }
      break;
    case "TRIGGER_SCHEDULE":
      if (activeScheduleList) {
        activeScheduleList.triggerSelected();
      } else if (activeScheduleDetail && store.getState().scheduleDetail) {
        triggerScheduleFromDetail(store, client, store.getState().scheduleDetail!);
      }
      break;
    case "DELETE_SCHEDULE":
      if (activeScheduleList) activeScheduleList.deleteSelected();
      break;

    // Activity actions
    case "PAUSE_ACTIVITY":
      if (activeWorkflowDetail?.isOnPendingTab()) {
        const activity = activeWorkflowDetail.getSelectedActivity();
        if (activity && store.getState().workflowDetail) {
          executeActivityAction(store, client, store.getState().workflowDetail!.workflowId, activity.activityId, "pause");
        }
      }
      break;
    case "UNPAUSE_ACTIVITY":
      if (activeWorkflowDetail?.isOnPendingTab()) {
        const activity = activeWorkflowDetail.getSelectedActivity();
        if (activity && store.getState().workflowDetail) {
          executeActivityAction(store, client, store.getState().workflowDetail!.workflowId, activity.activityId, "unpause");
        }
      }
      break;
    case "RESET_ACTIVITY":
      if (activeWorkflowDetail?.isOnPendingTab()) {
        const activity = activeWorkflowDetail.getSelectedActivity();
        if (activity && store.getState().workflowDetail) {
          executeActivityAction(store, client, store.getState().workflowDetail!.workflowId, activity.activityId, "reset");
        }
      }
      break;

    case "SEARCH":
      if (activeWorkflowList) {
        activeWorkflowList.focusSearch();
      }
      break;

    case "CYCLE_FILTER":
      if (activeWorkflowList) {
        activeWorkflowList.cycleStatus();
      }
      break;
  }
}

// View navigation functions
async function navigateToWorkflowDetail(
  renderer: CliRenderer,
  workflowId: string,
  runId?: string
): Promise<void> {
  if (!currentShell || !currentStore || !currentClient) return;

  // Load workflow detail
  try {
    const detail = await currentClient.describeWorkflow(workflowId, runId);
    currentStore.dispatch({ type: "SET_WORKFLOW_DETAIL", payload: detail });

    // Load history
    const history = await currentClient.getWorkflowHistory(workflowId, runId);
    currentStore.dispatch({ type: "SET_WORKFLOW_HISTORY", payload: history.items });
  } catch (error) {
    currentStore.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  // Create detail view
  activeWorkflowDetail = new WorkflowDetail(renderer, {
    store: currentStore,
    onBack: () => navigateToWorkflowList(renderer),
  });

  // Switch view
  currentStore.dispatch({ type: "SET_ACTIVE_VIEW", payload: "workflow-detail" });
  currentShell.setContent(activeWorkflowDetail);
  activeWorkflowList = null;
  activeScheduleList = null;
  activeScheduleDetail = null;
}

function navigateToWorkflowList(renderer: CliRenderer): void {
  if (!currentShell || !currentStore || !currentClient) return;

  // Clear detail state
  currentStore.dispatch({ type: "SET_WORKFLOW_DETAIL", payload: null });
  currentStore.dispatch({ type: "SET_WORKFLOW_HISTORY", payload: [] });

  const store = currentStore;
  const client = currentClient;

  // Create list view
  activeWorkflowList = new WorkflowList(renderer, {
    store,
    onSelectWorkflow: async (workflow) => {
      await navigateToWorkflowDetail(renderer, workflow.workflowId, workflow.runId);
    },
    onFilterChange: async () => {
      await loadWorkflows(store, client);
    },
  });

  // Switch view
  currentStore.dispatch({ type: "SET_ACTIVE_VIEW", payload: "workflows" });
  currentShell.setContent(activeWorkflowList);
  activeWorkflowDetail = null;
  activeScheduleList = null;
  activeScheduleDetail = null;
}

async function navigateToScheduleList(renderer: CliRenderer): Promise<void> {
  if (!currentShell || !currentStore || !currentClient) return;

  const store = currentStore;
  const client = currentClient;

  // Load schedules
  await loadSchedules(store, client);

  // Create schedule list view
  activeScheduleList = new ScheduleList(renderer, {
    store,
    onSelectSchedule: async (schedule) => {
      await navigateToScheduleDetail(renderer, schedule.scheduleId);
    },
    onToggleSchedule: async (schedule) => {
      await toggleSchedule(store, client, schedule);
    },
    onTriggerSchedule: async (schedule) => {
      await triggerSchedule(store, client, schedule);
    },
    onDeleteSchedule: async (schedule) => {
      showScheduleDeleteModal(renderer, store, client, schedule);
    },
  });

  // Switch view
  store.dispatch({ type: "SET_ACTIVE_VIEW", payload: "schedules" });
  currentShell.setContent(activeScheduleList);
  activeWorkflowList = null;
  activeWorkflowDetail = null;
  activeScheduleDetail = null;
}

async function navigateToScheduleDetail(
  renderer: CliRenderer,
  scheduleId: string
): Promise<void> {
  if (!currentShell || !currentStore || !currentClient) return;

  // Load schedule detail
  try {
    const detail = await currentClient.describeSchedule(scheduleId);
    currentStore.dispatch({ type: "SET_SCHEDULE_DETAIL", payload: detail });
  } catch (error) {
    currentStore.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  // Create detail view
  activeScheduleDetail = new ScheduleDetail(renderer, {
    store: currentStore,
    onBack: () => navigateToScheduleList(renderer),
  });

  // Switch view
  currentStore.dispatch({ type: "SET_ACTIVE_VIEW", payload: "schedule-detail" });
  currentShell.setContent(activeScheduleDetail);
  activeWorkflowList = null;
  activeWorkflowDetail = null;
  activeScheduleList = null;
}

// Modal management
function showWorkflowActionModal(
  renderer: CliRenderer,
  store: Store,
  client: TemporalClient,
  actionType: ConfirmationType
): void {
  // Get current workflow
  const state = store.getState();
  let workflowId: string | null = null;

  if (state.activeView === "workflow-detail" && state.workflowDetail) {
    workflowId = state.workflowDetail.workflowId;
  } else if (state.activeView === "workflows" && activeWorkflowList) {
    const selected = activeWorkflowList.selectedWorkflow;
    if (selected) {
      workflowId = selected.workflowId;
    }
  }

  if (!workflowId) {
    return; // No workflow selected
  }

  const wfId = workflowId;
  activeModal = new ConfirmModal(renderer, {
    type: actionType,
    workflowId: wfId,
    onConfirm: async () => {
      closeModal(renderer);
      await executeWorkflowAction(store, client, wfId, actionType);
    },
    onCancel: () => {
      closeModal(renderer);
    },
  });

  renderer.root.add(activeModal);
}

function closeModal(renderer: CliRenderer): void {
  if (activeModal) {
    renderer.root.remove(activeModal.id);
    activeModal.destroy();
    activeModal = null;
  }
}

// Help overlay management
function showHelpOverlay(renderer: CliRenderer, store: Store): void {
  if (helpOverlay) return;

  helpOverlay = new HelpOverlay(renderer, {
    onClose: () => {
      closeHelpOverlay(renderer, store);
    },
  });

  store.dispatch({ type: "SET_HELP_OVERLAY_OPEN", payload: true });
  renderer.root.add(helpOverlay);
}

function closeHelpOverlay(renderer: CliRenderer, store: Store): void {
  if (helpOverlay) {
    renderer.root.remove(helpOverlay.id);
    helpOverlay.destroy();
    helpOverlay = null;
    store.dispatch({ type: "SET_HELP_OVERLAY_OPEN", payload: false });
  }
}

// Error toast management
function showErrorToast(renderer: CliRenderer, message: string): void {
  // Dismiss existing toast if any
  if (errorToast) {
    dismissErrorToast(renderer);
  }

  errorToast = new ErrorToast(renderer, {
    message,
    onDismiss: () => {
      dismissErrorToast(renderer);
    },
  });

  renderer.root.add(errorToast);
}

function dismissErrorToast(renderer: CliRenderer): void {
  if (errorToast) {
    renderer.root.remove(errorToast.id);
    errorToast.destroy();
    errorToast = null;
  }
}

// Plugin commands
function getPluginCommands(store: Store, client: TemporalClient): Command[] {
  if (!pluginManager) return [];

  const pluginCommands = pluginManager.getCommands();
  const commands: Command[] = [];

  for (const cmd of pluginCommands) {
    // Create a plugin context for command execution
    const pluginId = cmd.id.split(":")[0] ?? "unknown";
    const context = createPluginContext({
      store,
      client,
      pluginId,
    });

    // Check if command is available
    if (cmd.when && !cmd.when(context)) {
      continue;
    }

    commands.push({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      shortcut: cmd.shortcut,
      category: cmd.category ?? "Plugins",
      action: () => {
        cmd.execute(context);
      },
    });
  }

  return commands;
}

// Saved view commands
function getSavedViewCommands(store: Store, client: TemporalClient): Command[] {
  const savedViews = store.getState().savedViews;
  const commands: Command[] = [];

  // Add command for each saved view
  for (let i = 0; i < savedViews.length; i++) {
    const view = savedViews[i];
    if (!view) continue;

    commands.push({
      id: `saved-view-${view.id}`,
      name: view.name,
      description: view.description ?? view.query,
      shortcut: i < 9 ? String(i + 1) : undefined, // Quick access 1-9
      category: "Saved Views",
      action: () => {
        applySavedView(store, client, view);
      },
    });
  }

  // Add "Save Current View" command
  commands.push({
    id: "save-current-view",
    name: "Save Current View",
    description: "Save current filters as a new view",
    shortcut: "Ctrl+S",
    category: "Saved Views",
    action: () => {
      saveCurrentView(store);
    },
  });

  return commands;
}

function applySavedView(store: Store, client: TemporalClient, view: SavedView): void {
  store.dispatch({ type: "SET_ACTIVE_SAVED_VIEW", payload: view.id });
  store.dispatch({ type: "SET_FILTERS", payload: { query: view.query } });
  loadWorkflows(store, client);
}

function saveCurrentView(store: Store): void {
  const state = store.getState();
  const query = state.filters.query;

  if (!query) {
    store.dispatch({ type: "SET_ERROR", payload: "No active filter to save" });
    return;
  }

  // Create a new saved view
  const newView = addSavedView({
    name: `View ${state.savedViews.length + 1}`,
    query,
  });

  // Reload saved views
  const config = loadSavedViews();
  store.dispatch({ type: "SET_SAVED_VIEWS", payload: config.views });
  store.dispatch({ type: "SET_ACTIVE_SAVED_VIEW", payload: newView.id });
}

// Command palette
function getCommands(
  renderer: CliRenderer,
  store: Store,
  client: TemporalClient
): Command[] {
  return [
    // Navigation commands
    {
      id: "goto-workflows",
      name: "Go to Workflows",
      description: "View workflow executions",
      shortcut: "1",
      category: "Navigation",
      action: () => {
        store.dispatch({ type: "SET_ACTIVE_VIEW", payload: "workflows" });
        navigateToWorkflowList(renderer);
      },
    },
    {
      id: "goto-schedules",
      name: "Go to Schedules",
      description: "View scheduled workflows",
      shortcut: "2",
      category: "Navigation",
      action: () => {
        navigateToScheduleList(renderer);
      },
    },
    {
      id: "goto-task-queues",
      name: "Go to Task Queues",
      description: "View task queue status",
      shortcut: "3",
      category: "Navigation",
      action: () => {
        store.dispatch({ type: "SET_ACTIVE_VIEW", payload: "task-queues" });
      },
    },

    // Workflow actions
    {
      id: "search-workflows",
      name: "Search Workflows",
      description: "Search by workflow ID",
      shortcut: "/",
      category: "Workflows",
      action: () => {
        if (activeWorkflowList) {
          activeWorkflowList.focusSearch();
        }
      },
    },
    {
      id: "refresh",
      name: "Refresh",
      description: "Reload current view data",
      shortcut: "Ctrl+R",
      category: "Workflows",
      action: () => {
        refreshCurrentView(store, client);
      },
    },
    {
      id: "clear-filters",
      name: "Clear Filters",
      description: "Remove all active filters",
      category: "Workflows",
      action: () => {
        if (activeWorkflowList) {
          activeWorkflowList.clearFilters();
        }
        store.dispatch({ type: "SET_FILTERS", payload: {} });
        loadWorkflows(store, client);
      },
    },

    // Schedule commands
    {
      id: "toggle-schedule",
      name: "Toggle Schedule",
      description: "Pause or unpause selected schedule",
      shortcut: "p",
      category: "Schedules",
      action: () => {
        if (activeScheduleList) {
          activeScheduleList.toggleSelected();
        }
      },
    },
    {
      id: "trigger-schedule",
      name: "Trigger Schedule",
      description: "Run scheduled workflow immediately",
      shortcut: "T",
      category: "Schedules",
      action: () => {
        if (activeScheduleList) {
          activeScheduleList.triggerSelected();
        }
      },
    },
    {
      id: "refresh-schedules",
      name: "Refresh Schedules",
      description: "Reload schedule list",
      category: "Schedules",
      action: () => {
        loadSchedules(store, client);
      },
    },

    // View actions
    {
      id: "toggle-polling",
      name: "Toggle Polling",
      description: store.getState().pollingEnabled ? "Disable auto-refresh" : "Enable auto-refresh",
      category: "Settings",
      action: () => {
        const enabled = !store.getState().pollingEnabled;
        store.dispatch({ type: "SET_POLLING_ENABLED", payload: enabled });
      },
    },

    // Saved Views
    ...getSavedViewCommands(store, client),

    // Application
    {
      id: "quit",
      name: "Quit",
      description: "Exit the application",
      shortcut: "q",
      category: "Application",
      action: () => {
        renderer.destroy();
      },
    },
    {
      id: "help",
      name: "Help",
      description: "Show keyboard shortcuts",
      shortcut: "?",
      category: "Application",
      action: () => {
        showHelpOverlay(renderer, store);
      },
    },

    // Plugin commands
    ...getPluginCommands(store, client),
  ];
}

function showCommandPalette(
  renderer: CliRenderer,
  store: Store,
  client: TemporalClient
): void {
  if (commandPalette) return;

  const commands = getCommands(renderer, store, client);

  commandPalette = new CommandPalette(renderer, {
    commands,
    onClose: () => {
      closeCommandPalette(renderer, store);
    },
  });

  store.dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
  renderer.root.add(commandPalette);
}

function closeCommandPalette(renderer: CliRenderer, store: Store): void {
  if (commandPalette) {
    renderer.root.remove(commandPalette.id);
    commandPalette.destroy();
    commandPalette = null;
    store.dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
  }
}

function showNamespaceSelector(
  renderer: CliRenderer,
  store: Store,
  client: TemporalClient
): void {
  if (namespaceSelector) return;

  const state = store.getState();

  namespaceSelector = new NamespaceSelector(renderer, {
    namespaces: state.namespaces,
    currentNamespace: state.namespace,
    onSelect: async (namespace) => {
      closeNamespaceSelector(renderer, store);
      await switchNamespace(store, client, namespace);
    },
    onClose: () => {
      closeNamespaceSelector(renderer, store);
    },
  });

  store.dispatch({ type: "SET_NAMESPACE_SELECTOR_OPEN", payload: true });
  renderer.root.add(namespaceSelector);
}

function closeNamespaceSelector(renderer: CliRenderer, store: Store): void {
  if (namespaceSelector) {
    renderer.root.remove(namespaceSelector.id);
    namespaceSelector.destroy();
    namespaceSelector = null;
    store.dispatch({ type: "SET_NAMESPACE_SELECTOR_OPEN", payload: false });
  }
}

async function switchNamespace(
  store: Store,
  client: TemporalClient,
  namespace: string
): Promise<void> {
  // Update client to use new namespace
  client.setNamespace(namespace);

  // Update store
  store.dispatch({ type: "SET_NAMESPACE", payload: namespace });

  // Clear current data
  store.dispatch({ type: "SET_WORKFLOWS", payload: [] });
  store.dispatch({ type: "SET_SCHEDULES", payload: [] });
  store.dispatch({ type: "SET_WORKFLOW_DETAIL", payload: null });
  store.dispatch({ type: "SET_WORKFLOW_HISTORY", payload: [] });
  store.dispatch({ type: "SET_SCHEDULE_DETAIL", payload: null });

  // Refresh data for new namespace
  await refreshCurrentView(store, client);
}

async function executeActivityAction(
  store: Store,
  client: TemporalClient,
  workflowId: string,
  activityId: string,
  actionType: "pause" | "unpause" | "reset"
): Promise<void> {
  try {
    if (actionType === "pause") {
      await client.pauseActivity(workflowId, activityId);
    } else if (actionType === "unpause") {
      await client.unpauseActivity(workflowId, activityId);
    } else if (actionType === "reset") {
      await client.resetActivity(workflowId, activityId);
    }
    // Refresh workflow detail after action
    await refreshCurrentView(store, client);
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeWorkflowAction(
  store: Store,
  client: TemporalClient,
  workflowId: string,
  actionType: ConfirmationType
): Promise<void> {
  try {
    if (actionType === "cancel") {
      await client.cancelWorkflow(workflowId);
    } else if (actionType === "terminate") {
      await client.terminateWorkflow(workflowId, "Terminated via TUI");
    }

    // Refresh workflow data after action
    await refreshCurrentView(store, client);
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function refreshCurrentView(store: Store, client: TemporalClient): Promise<void> {
  const state = store.getState();

  if (state.activeView === "workflow-detail" && state.workflowDetail) {
    // Refresh detail view
    try {
      const detail = await client.describeWorkflow(
        state.workflowDetail.workflowId,
        state.workflowDetail.runId
      );
      store.dispatch({ type: "SET_WORKFLOW_DETAIL", payload: detail });

      const history = await client.getWorkflowHistory(
        state.workflowDetail.workflowId,
        state.workflowDetail.runId
      );
      store.dispatch({ type: "SET_WORKFLOW_HISTORY", payload: history.items });
    } catch (error) {
      store.dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (state.activeView === "schedule-detail" && state.scheduleDetail) {
    // Refresh schedule detail view
    try {
      const detail = await client.describeSchedule(state.scheduleDetail.scheduleId);
      store.dispatch({ type: "SET_SCHEDULE_DETAIL", payload: detail });
    } catch (error) {
      store.dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (state.activeView === "schedules") {
    // Refresh schedules view
    await loadSchedules(store, client);
  } else {
    // Refresh list view
    await loadWorkflows(store, client);
  }
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let pollingTimeoutId: ReturnType<typeof setTimeout> | null = null;

async function startPolling(store: Store, client: TemporalClient): Promise<void> {
  // Initial load
  await loadWorkflows(store, client);

  // Set up polling with dynamic interval
  scheduleNextPoll(store, client);
}

function scheduleNextPoll(store: Store, client: TemporalClient): void {
  if (pollingTimeoutId) {
    clearTimeout(pollingTimeoutId);
  }

  const state = store.getState();
  if (!state.pollingEnabled || state.connectionStatus !== "connected") {
    return;
  }

  // Calculate next poll interval with exponential backoff on errors
  let interval = state.pollingInterval;
  if (state.errorCount > 0) {
    // Exponential backoff: 3s, 6s, 12s, 24s, max 60s
    interval = Math.min(interval * Math.pow(2, state.errorCount), 60000);
  }

  pollingTimeoutId = setTimeout(async () => {
    const currentState = store.getState();
    if (currentState.pollingEnabled && currentState.connectionStatus === "connected") {
      await loadWorkflows(store, client);
      scheduleNextPoll(store, client);
    }
  }, interval);
}

async function loadSchedules(store: Store, client: TemporalClient): Promise<void> {
  try {
    const schedules = await client.listSchedules();
    store.dispatch({ type: "SET_SCHEDULES", payload: schedules });
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function toggleSchedule(
  store: Store,
  client: TemporalClient,
  schedule: import("./data/temporal/types").Schedule
): Promise<void> {
  try {
    const shouldPause = schedule.state === "ACTIVE";
    await client.toggleSchedule(schedule.scheduleId, shouldPause);
    // Reload schedules after toggle
    await loadSchedules(store, client);
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function triggerSchedule(
  store: Store,
  client: TemporalClient,
  schedule: import("./data/temporal/types").Schedule
): Promise<void> {
  try {
    await client.triggerSchedule(schedule.scheduleId);
    // Reload schedules after trigger
    await loadSchedules(store, client);
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function toggleScheduleFromDetail(
  store: Store,
  client: TemporalClient,
  schedule: import("./data/temporal/types").Schedule
): Promise<void> {
  try {
    const shouldPause = schedule.state === "ACTIVE";
    await client.toggleSchedule(schedule.scheduleId, shouldPause);
    // Refresh the schedule detail
    const updated = await client.describeSchedule(schedule.scheduleId);
    store.dispatch({ type: "SET_SCHEDULE_DETAIL", payload: updated });
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

async function triggerScheduleFromDetail(
  store: Store,
  client: TemporalClient,
  schedule: import("./data/temporal/types").Schedule
): Promise<void> {
  try {
    await client.triggerSchedule(schedule.scheduleId);
    // Refresh the schedule detail
    const updated = await client.describeSchedule(schedule.scheduleId);
    store.dispatch({ type: "SET_SCHEDULE_DETAIL", payload: updated });
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
  }
}

function showScheduleDeleteModal(
  renderer: CliRenderer,
  store: Store,
  client: TemporalClient,
  schedule: import("./data/temporal/types").Schedule
): void {
  activeModal = new ConfirmModal(renderer, {
    type: "terminate", // Reuse terminate styling for delete
    workflowId: schedule.scheduleId,
    onConfirm: async () => {
      closeModal(renderer);
      try {
        await client.deleteSchedule(schedule.scheduleId);
        await loadSchedules(store, client);
      } catch (error) {
        store.dispatch({
          type: "SET_ERROR",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    onCancel: () => {
      closeModal(renderer);
    },
  });
  renderer.root.add(activeModal);
}

async function loadWorkflows(store: Store, client: TemporalClient): Promise<void> {
  // Signal that we're polling
  store.dispatch({ type: "SET_IS_POLLING", payload: true });

  try {
    const filters = store.getState().filters;

    // Build visibility query
    const queryParts: string[] = [];

    // Add search query (workflow ID or type filter)
    if (filters.query) {
      // If it looks like a full query, use it directly
      if (filters.query.includes("=") || filters.query.includes(">") || filters.query.includes("<")) {
        queryParts.push(filters.query);
      } else {
        // Otherwise search by workflow ID prefix
        queryParts.push(`WorkflowId STARTS_WITH "${filters.query}"`);
      }
    }

    // Add status filter
    if (filters.status && filters.status.length > 0) {
      const statusQuery = filters.status
        .map((s) => `ExecutionStatus = "${s}"`)
        .join(" OR ");
      queryParts.push(`(${statusQuery})`);
    }

    const query = queryParts.length > 0 ? queryParts.join(" AND ") : undefined;

    const result = await client.listWorkflows({
      query,
      pageSize: 50,
    });
    store.dispatch({ type: "SET_WORKFLOWS", payload: result.items });
    store.dispatch({ type: "SET_ERROR", payload: null });
    store.dispatch({ type: "RESET_ERROR_COUNT" });
    store.dispatch({ type: "SET_LAST_POLLED", payload: new Date().toISOString() });
  } catch (error) {
    store.dispatch({
      type: "SET_ERROR",
      payload: error instanceof Error ? error.message : String(error),
    });
    store.dispatch({ type: "INCREMENT_ERROR_COUNT" });
  } finally {
    store.dispatch({ type: "SET_IS_POLLING", payload: false });
  }
}

export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (pollingTimeoutId) {
    clearTimeout(pollingTimeoutId);
    pollingTimeoutId = null;
  }
}
