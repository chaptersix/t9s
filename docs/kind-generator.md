# Kind Generator Pattern

This document describes the intended generator pattern for declaring Temporal resource Kinds
in a compact, consistent way. The goal is to make it easy to add new Kinds by declaratively
defining collection, detail, and operation behavior while keeping runtime behavior fully
compile-time and type-safe.

## Goals

- Reduce boilerplate when adding a new Kind.
- Ensure Kind declarations are centralized and consistent.
- Keep all behavior compile-time (no runtime config parsing).
- Preserve type safety (no dynamic invocation or stringly-typed dispatch).

## Design Overview

The generator is a `macro_rules!` macro named `kind!` that expands into:

- A `KindSpec` instance.
- Static `CollectionSpec` and `DetailSpec` definitions.
- An operation list (`OperationSpec`) and effect mapping (`OperationEffectSpec`).

The macro is designed to be declarative but still allow calling existing functions for
row rendering, list widths, and effect mapping.

## Example Declaration

```rust
kind! {
  id: WorkflowExecution,
  label: "Workflows",

  collection {
    header: [" Status", "Workflow ID", "Type", "Started", "Task Queue"],
    widths: workflow_widths,
    rows: workflow_rows,
    loading_label: " Loading workflows...",
    empty_label: " No workflows loaded",
    is_loading: workflow_is_loading,
    table_state: workflow_table_state,
  }

  detail {
    render: workflow_detail::render,
    tabs: ["Summary", "Input/Output", "History", "Pending Activities", "Task Queue"],
  }

  operations [
    { id: CancelWorkflow, label: "Cancel workflow", key: 'c', confirm: true, effects: workflow_cancel_effects },
    { id: TerminateWorkflow, label: "Terminate workflow", key: 't', confirm: true, effects: workflow_terminate_effects },
  ]
}
```

## Macro Expansion (Conceptual)

The macro expands into something like:

```rust
static WORKFLOW_COLLECTION: CollectionSpec = CollectionSpec { ... };
static WORKFLOW_DETAIL: DetailSpec = DetailSpec { ... };
static WORKFLOW_OPS: &[OperationSpec] = &[ ... ];
static WORKFLOW_OP_EFFECTS: &[OperationEffectSpec] = &[ ... ];

static WORKFLOW_SPEC: KindSpec = KindSpec {
  id: KindId::WorkflowExecution,
  label: "Workflows",
  collection: &WORKFLOW_COLLECTION,
  detail: Some(&WORKFLOW_DETAIL),
  operations: WORKFLOW_OPS,
};
```

## Input Types and Contracts

- `header`: `&'static [&'static str]`
- `widths`: `fn() -> Vec<Constraint>`
- `rows`: `fn(&App) -> Option<Vec<Row<'static>>>`
- `is_loading`: `fn(&App) -> bool`
- `table_state`: `fn(&mut App) -> &mut TableState`
- `detail.render`: `fn(&App, &mut Frame, Rect)`
- `detail.tabs`: `&'static [&'static str]`
- `effects`: `fn(&OperationTarget, &App) -> Vec<Effect>`

## Effect Mapping

Each operation declares its effect mapping function. This keeps the operation registry
purely declarative while still allowing custom logic for special cases such as
pause/unpause based on current state.

## Why Macro Instead of Config

This project favors compile-time Rust declarations because:

- Existing list/detail rendering relies on typed data and functions.
- Effects are wired to concrete client methods.
- Performance and safety are priorities.

The macro enables config-like ergonomics without sacrificing Rust type safety.

## Next Steps

- Introduce the `kind!` macro in `src/kinds/macros.rs`.
- Migrate existing `KindSpec` declarations to the macro.
- Add tests to ensure macro expansions match expected specs.

## Example macro_rules! implementation

```rust
#[macro_export]
macro_rules! kind {
    (
        id: $id:ident,
        label: $label:expr,

        collection {
            header: [$($header:expr),+ $(,)?],
            widths: $widths:path,
            rows: $rows:path,
            loading_label: $loading_label:expr,
            empty_label: $empty_label:expr,
            is_loading: $is_loading:path,
            table_state: $table_state:path,
        }

        detail {
            render: $render:path,
            tabs: [$($tabs:expr),* $(,)?],
        }

        operations [
            $(
                {
                    id: $op_id:ident,
                    label: $op_label:expr,
                    key: $op_key:expr,
                    confirm: $op_confirm:expr,
                    effects: $op_effects:path
                }
            ),+ $(,)?
        ]
    ) => {
        const DETAIL_TABS: &[&str] = &[$($tabs),*];

        static COLLECTION_SPEC: $crate::kinds::CollectionSpec = $crate::kinds::CollectionSpec {
            header: &[$($header),+],
            widths: $widths,
            rows: $rows,
            loading_label: $loading_label,
            empty_label: $empty_label,
            is_loading: $is_loading,
            table_state: $table_state,
        };

        static DETAIL_SPEC: $crate::kinds::DetailSpec = $crate::kinds::DetailSpec {
            render: $render,
        };

        static OPERATIONS: &[$crate::kinds::OperationSpec] = &[
            $(
                $crate::kinds::OperationSpec {
                    id: $crate::kinds::OperationId::$op_id,
                    label: $op_label,
                    key: $op_key,
                    requires_confirm: $op_confirm,
                },
            )+
        ];

        static OP_EFFECTS: &[$crate::kinds::OperationEffectSpec] = &[
            $(
                $crate::kinds::OperationEffectSpec {
                    op: $crate::kinds::OperationId::$op_id,
                    kind: $crate::kinds::KindId::$id,
                    to_effects: $op_effects,
                },
            )+
        ];

        $crate::kinds::KindSpec {
            id: $crate::kinds::KindId::$id,
            label: $label,
            collection: &COLLECTION_SPEC,
            detail: Some(&DETAIL_SPEC),
            operations: OPERATIONS,
        }
    };
}
```
