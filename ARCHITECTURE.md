# Architecture

This document describes the target architecture for t9s as a Kind-driven UI with deep-link
navigation. The goal is to make workflows, schedules, and future Temporal resource types
first-class and extensible without duplicating UI logic.

## Goals

- Make resource types extensible: workflows and schedules are just the first two Kinds.
- Drive list/detail rendering, filtering, operations, keybindings, and help/footer hints
  from a single Kind declaration.
- Add URL-like navigation and breadcrumbs via canonical deep links.
- Support deep links to both collections (lists) and individual resources, including
  Temporal List Filters.

## Non-goals (initially)

- Runtime-loaded Kind config (YAML/JSON). Declarations are compile-time Rust.
- Encoding pagination tokens in URIs (start with stable links).

## Core Concepts

### Kind (Resource Kind)

A Kind is a Temporal resource the UI can represent, such as Workflow Execution or Schedule.
Each Kind has a declarative spec that defines how it is listed, described, and operated on.

### Capability

Capabilities are optional features a Kind can support:

- Collection: list + pagination + List Filter (query string `q`).
- Detail: describe + optional tabs/sections.
- Operations: invokable actions (terminate, signal, pause, trigger, delete, etc).
- Children: nested collections/details (schedule -> workflows; workflow -> activities).

### Identity

A Kind-specific identifier used for selection, operations, and navigation:

- Workflow Execution: `workflow_id` plus optional `run_id`.
- Schedule: `schedule_id`.

Namespace is part of the route root, not the identity payload.

### Location (Route)

The current app address, analogous to a browser location. It is parsed from and formatted
to a deep-link URI and rendered as breadcrumbs. Multiple URIs may resolve to the same
Location (aliases), and each Location should have a canonical URI used for display and
copying.

### Deep Link URI

Canonical format:

```
temporal://tui/namespaces/{namespace}/{route...}?q=...&tab=...&run_id=...
```

The `q` query parameter is Temporal's List Filter (Visibility query) and is passed to list
RPCs that support it. Some routes are aliases of others (for example, a workflow detail
reachable from the workflows list or from a schedule's child list). Aliases must normalize
to the same Location and emit a single canonical URI.

## Deep Link Routes (Initial)

### Collections

- `temporal://tui/namespaces/{ns}/workflows?q=...`
- `temporal://tui/namespaces/{ns}/schedules?q=...`

### Details

- `temporal://tui/namespaces/{ns}/workflows/{workflow_id}?run_id=...&tab=...`
- `temporal://tui/namespaces/{ns}/schedules/{schedule_id}`

### Nested (Children)

- `temporal://tui/namespaces/{ns}/workflows/{workflow_id}/activities`
- `temporal://tui/namespaces/{ns}/workflows/{workflow_id}/activities/{activity_id}`
- `temporal://tui/namespaces/{ns}/schedules/{schedule_id}/workflows?q=...`

For schedule -> workflows, the base filter is derived from the schedule id
(`TemporalScheduledById = '{id}'`). If `q` is provided, the effective filter is:

```
({base}) AND ({q})
```

## Kind Declaration (Compile-time Rust)

Each Kind registers a `KindSpec` in a central registry. The spec is the single source of
truth for navigation, rendering, operations, and keybindings.

### KindSpec Responsibilities

- Navigation
  - Routes it owns (collection/detail/children).
  - Identity parsing/formatting for URIs.
  - Breadcrumb label formatting.
- Collection view
  - Columns and row adapters.
  - List Filter support.
  - List/count effect wiring.
- Detail view
  - Describe effect wiring.
  - Tabs/sections (if any).
- Operations
  - Operation list (id, label, keybinding, confirm policy, required inputs).
  - Translation from operation invocation to effects/worker requests.

## App State Model

Replace hard-coded view enums with a route-driven Location:

- Current: `View::{WorkflowList, WorkflowDetail, ScheduleList, ScheduleDetail}`
- Target: `App.location: Location` where the leaf segment determines what to render.

Collection state (selection, page token, current filter, loading flags) is stored per Kind
or per route key as needed. Domain structs remain typed per Kind; the KindSpec provides
adapters for rendering.

## Keybindings and Operations

Keybindings are derived from the current Kind and location:

- Global navigation keys remain static (j/k, gg/G, Enter, Esc, /, :, ?, q).
- Operation keys are defined in the KindSpec.
- `key_to_action` becomes: apply global keys first, then check KindSpec operations.

Help and footer hints are rendered from the current KindSpec and Location.

## Commands and URI Entry Points

Add a command for deep-link navigation, for example:

```
:open temporal://tui/namespaces/prod/workflows?q=ExecutionStatus%20%3D%20%27Running%27
```

This parses the URI, updates `App.location`, and triggers the load effects for the leaf
segment.

## Adding a New Kind

1. Add domain types under `src/domain/{kind}.rs` as needed.
2. Add client methods / worker requests for list/describe/operations.
3. Create a new `KindSpec`:
   - Routes + identity parsing/formatting.
   - Collection columns + row adapter + list/count effects.
   - Detail tabs/sections + describe effects.
   - Operations (keybinding, confirmation, inputs, effect translation).
4. Register it in `kinds::registry()`.
5. Add tests for URI parsing/formatting and route -> effect mapping.

## Module Layout (Target)

- `src/kinds/mod.rs`
  - `KindId`, `KindSpec`, `OperationSpec`, `RouteSpec`, registry
- `src/nav/uri.rs`
  - Parse/format `temporal://tui/...` URIs into `Location`
- `src/nav/location.rs`
  - `Location` representation and breadcrumb helpers
- `src/widgets/collection.rs`
  - Generic table renderer driven by `CollectionSpec`
- `src/widgets/detail.rs` (or keep per-kind detail widgets initially)
- `src/input/keymap.rs`
  - Key -> Action mapping derived from KindSpec + Location

## Migration Plan

### Phase 1: Deep link foundation

- Implement URI parse/format and `Location` type.
- Render breadcrumbs from `App.location` (map existing views to a Location initially).
- Add `:open <uri>` command; support top-level lists and details first.

### Phase 2: Kind registry introduction

- Add `KindId` + `KindSpec` registry for Workflow Execution and Schedule.
- Use KindSpec for breadcrumb labels and help/footer operation hints.
- Make List Filter storage per Kind; add `q` to schedule list RPCs.

### Phase 3: Generic collection rendering

- Build `widgets::collection` generic table renderer.
- Port workflow list and schedule list to the generic renderer.

### Phase 4: Route-driven navigation

- Replace `View` with `Location` as the navigation state.
- Rendering and selection logic are driven by the leaf route.

### Phase 5: Operations become Kind-driven

- Introduce `Action::RunOperation { op_id }` and generic confirm modal.
- Keymap consults current KindSpec operations for key -> action mapping.
- Worker dispatch becomes a generic run-operation path.

### Phase 6: Nested routes

- Implement schedule -> workflows collection (derived filter).
- Implement workflow -> activities collection (from pending activities/history).
- Add corresponding URI routes and breadcrumbs.

### Phase 7: Cleanup + tests

- Remove legacy per-kind view wiring and duplicated widgets.
- Add tests for URI roundtrips, route -> effects, and keymap coverage.

## Testing Notes

- URI roundtrip tests live in `src/nav/uri.rs`.
- Route-to-effects tests live in `src/app.rs`.
