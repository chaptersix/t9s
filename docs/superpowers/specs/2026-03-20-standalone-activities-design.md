# Standalone Activity Support for t9s

## Overview

Add standalone activities (activities running outside of workflows) as a first-class resource type in t9s, with full parity to the existing Workflow and Schedule kinds: collection view with filtering/pagination, detail view with tabs, and Cancel/Terminate/Delete operations.

Standalone activities are a new Temporal feature. The API surface is available via the existing proto-generated code (`ListActivityExecutions`, `DescribeActivityExecution`, etc.). A preview dev server is available at [temporalio/cli v1.6.2-standalone-activity](https://github.com/temporalio/cli/releases/tag/v1.6.2-standalone-activity).

## Feature Detection

Not all Temporal servers support standalone activities. The Activities tab is hidden when the server doesn't support the feature.

**Mechanism:** On startup (after namespace resolution), call `ListActivityExecutions` with `page_size=1`. If the server returns `tonic::Code::Unimplemented`, set `activities_supported = false` and hide the tab. Re-probe on namespace change.

**Visibility:** The tab bar filters out `ActivityExecution` when `activities_supported` is false. Kind-driven navigation (number keys, arrow keys) skips hidden kinds. If the user navigates to `:activities` before the probe completes, show a loading state.

## Domain Model

New file: `src/domain/activity_execution.rs`

### ActivityExecutionSummary

For collection rows. Mapped from proto `ActivityExecutionListInfo`.

| Field | Type |
|-------|------|
| activity_id | String |
| run_id | String |
| activity_type | String |
| status | ActivityExecutionStatus |
| schedule_time | Option\<DateTime\> |
| close_time | Option\<DateTime\> |
| task_queue | String |

Note: The proto list response has `schedule_time` (not `start_time`). The collection column header should read "Scheduled".

### ActivityExecutionDetail

For the detail view. Mapped from proto `ActivityExecutionInfo`.

All summary fields plus:

| Field | Type |
|-------|------|
| attempt | i32 |
| retry_state | String |
| last_heartbeat_time | Option\<DateTime\> |
| last_started_time | Option\<DateTime\> |
| last_failure_message | Option\<String\> |
| schedule_to_close_timeout | Option\<Duration\> |
| start_to_close_timeout | Option\<Duration\> |
| heartbeat_timeout | Option\<Duration\> |
| input | Option\<String\> (JSON-decoded payload) |
| output | Option\<String\> (JSON-decoded payload) |
| failure | Option\<String\> |
| deployment_info | Option\<String\> |

**Proto mapping notes:**
- The `DescribeActivityExecution` RPC requires `include_input=true` and `include_outcome=true` flags to populate input and outcome fields.
- The response `outcome` field is a `ActivityExecutionOutcome` oneof: `Result(Payloads)` maps to the `output` field, `Failure(Failure)` maps to the `failure` field.

### ActivityExecutionStatus

Enum: Running, Completed, Failed, Canceled, Terminated, TimedOut.

The existing `domain/activity.rs` (`PendingActivity` for workflow sub-activities) is untouched.

## Client Layer

### TemporalClient Trait Extensions

| Method | Returns |
|--------|---------|
| `list_activity_executions(namespace, query, page_size, next_page_token)` | `(Vec<ActivityExecutionSummary>, Vec<u8>)` |
| `describe_activity_execution(namespace, activity_id, run_id)` | `ActivityExecutionDetail` |
| `count_activity_executions(namespace, query)` | `u64` |
| `request_cancel_activity_execution(namespace, activity_id, run_id)` | `()` |
| `terminate_activity_execution(namespace, activity_id, run_id, reason)` | `()` |
| `delete_activity_execution(namespace, activity_id, run_id)` | `()` |
| `check_activity_support(namespace)` | `bool` |

Note: `run_id` is included in all methods that target a specific execution, ensuring operations act on the exact execution the user is viewing. The cancel method maps to the proto RPC `RequestCancelActivityExecution`.

### GrpcTemporalClient

Each method maps to its corresponding proto RPC and converts proto types to domain types. `check_activity_support` calls `list_activity_executions` with `page_size=1` and catches `Unimplemented`. The `describe_activity_execution` implementation must set `include_input=true` and `include_outcome=true` on the request.

## State & Actions

### App State (app.rs)

| Field | Type |
|-------|------|
| activity_executions | LoadState\<Vec\<ActivityExecutionSummary\>\> |
| activity_execution_detail | LoadState\<ActivityExecutionDetail\> |
| activity_execution_table_state | TableState |
| activity_execution_task_queue | LoadState\<TaskQueueInfo\> |
| activity_next_page_token | Vec\<u8\> |
| activity_count | Option\<u64\> |
| activities_supported | bool (default false) |
| activity_detail_tab | usize (default 0) |

### OperationTarget (app.rs)

Add variant: `ActivityExecution { activity_id: String, run_id: String }` to the existing `OperationTarget` enum.

### ViewType (action.rs)

Add `Activities` variant to the existing `ViewType` enum.

### Action Variants (action.rs)

- `ActivityExecutionsLoaded(Vec<ActivityExecutionSummary>, Vec<u8>)`
- `MoreActivityExecutionsLoaded(Vec<ActivityExecutionSummary>, Vec<u8>)`
- `ActivityExecutionDetailLoaded(ActivityExecutionDetail)`
- `ActivityExecutionCountLoaded(u64)`
- `ActivitiesSupported(bool)`
- Reuses existing `TaskQueueLoaded` for the task queue detail tab

### Effect Variants (app.rs)

- `LoadActivityExecutions { namespace, query, page_size, next_page_token }`
- `LoadMoreActivityExecutions { namespace, query, page_size, next_page_token }`
- `LoadActivityExecutionDetail { namespace, activity_id, run_id }`
- `CountActivityExecutions { namespace, query }`
- `RequestCancelActivityExecution { namespace, activity_id, run_id }`
- `TerminateActivityExecution { namespace, activity_id, run_id, reason }`
- `DeleteActivityExecution { namespace, activity_id, run_id }`
- `CheckActivitySupport { namespace }`

## Kind Registry & Navigation

### KindId

Add `ActivityExecution` variant to the `KindId` enum.

### KindSpec Entry

- **CollectionSpec** -- function pointers for rows, widths, is_loading, table_state. Columns: Status, Activity ID, Type, Scheduled, Close Time, Task Queue.
- **DetailSpec** -- render function for the 3-tab detail view.
- **Operations** -- Cancel, Terminate, Delete with keybindings following existing conventions.

### detail_tabs_for_kind / detail_tab_count

Add `ActivityExecution` arm returning `["Summary", "Input/Output", "Task Queue"]` (3 tabs).

### RouteSegment

Add `ActivityExecution { activity_id: String }` to `RouteSegment`. URI format: `temporal://tui/namespaces/<ns>/activities/<id>`.

### Commands

Add `:activities` command to navigate to the activity collection view.

## Worker & Effect Handling

### CliRequest Variants (worker.rs)

- `LoadActivityExecutions { namespace, query, page_size, next_page_token }`
- `LoadMoreActivityExecutions { namespace, query, page_size, next_page_token }`
- `DescribeActivityExecution { namespace, activity_id, run_id }`
- `CountActivityExecutions { namespace, query }`
- `RequestCancelActivityExecution { namespace, activity_id, run_id }`
- `TerminateActivityExecution { namespace, activity_id, run_id, reason }`
- `DeleteActivityExecution { namespace, activity_id, run_id }`
- `CheckActivitySupport { namespace }`

### Startup Flow

1. Namespace resolves
2. Emit `Effect::CheckActivitySupport { namespace }`
3. `Action::ActivitiesSupported(true/false)` sets `app.activities_supported`
4. On namespace change, re-probe

## Exhaustive Match Sites

Adding `KindId::ActivityExecution` and `ViewType::Activities` will require new match arms in multiple locations. Key sites:

**app.rs:** `handle_select`, `handle_back`, `navigate_up`, `navigate_down`, `navigate_top`, `navigate_bottom`, `refresh_current_view`, `run_operation`, `location`, `apply_location`, `maybe_load_more`, `SubmitSearch` handler, `SwitchNamespace` handler, `NextTab`/`PrevTab` handlers. Add `selected_activity_summary()` helper method (parallel to `selected_workflow_summary`).

**main.rs:** `render()` function match arms for `View::Collection(KindId::ActivityExecution)` and `View::Detail(KindId::ActivityExecution)`. `handle_effects()` match arms for all new Effect variants.

**kinds/mod.rs:** `detail_tabs_for_kind`, `detail_tab_count`.

**action.rs:** `SwitchView` match arm for `ViewType::Activities`.

## Widgets

### Collection View

Uses the existing generic `render_kind_collection()` via `CollectionSpec` function pointers. No new widget file needed.

### Detail View

New file: `src/widgets/activity_execution_detail.rs`

**3 tabs:**

1. **Summary** -- Activity ID, run ID, type, status (colored), task queue, attempt, retry state, timestamps, timeouts, last failure message.
2. **Input/Output** -- Input payloads and result/failure, JSON-formatted. Same rendering approach as the workflow I/O tab.
3. **Task Queue** -- Reuses existing task queue rendering. Calls `describe_task_queue` with the activity's task queue.

### Tab Bar

Filters out `ActivityExecution` when `app.activities_supported` is false.

### Footer

Shows activity count when on the activities collection view.

## Polling & Pagination

- **Polling** -- Same tick-based refresh pattern as workflows. Backoff on errors.
- **Pagination** -- `maybe_load_more()` checks `activity_next_page_token` on scroll near bottom. Emits `LoadMoreActivityExecutions`.
- **Page size** -- 20 for activity list calls (smaller than the workflow default of 50), 1 for feature detection probe.
- **Count** -- Refreshed alongside list calls, displayed in footer.
