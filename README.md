# t9s

A terminal UI for [Temporal](https://temporal.io) — like [k9s](https://k9scli.io) for Kubernetes.

```
┌─────────────────────────────────────────────────────────────┐
│ ● connected │ ns: default │ polling: 3s        │ ?:help    │
├─────────────────────────────────────────────────────────────┤
│ [1] Workflows  [2] Schedules  [3] Task Queues  [n] default │
├─────────────────────────────────────────────────────────────┤
│ Workflows (12 total)                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ WORKFLOW ID       TYPE          STATUS     STARTED     │ │
│ │►order-12345       OrderFlow     ● Running  2m ago      │ │
│ │ payment-67890     PaymentFlow   ✓ Done     5m ago      │ │
│ │ notify-abc        NotifyFlow    ✗ Failed   10m ago     │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:open  /:search  n:namespace  ?:help    │
└─────────────────────────────────────────────────────────────┘
```

## Features

- **Workflow Management** - Browse, filter, search, cancel, terminate workflows
- **Schedule Management** - View, pause/unpause, trigger scheduled workflows
- **Vim-style Navigation** - j/k, gg/G, Ctrl+D/U, and more
- **Command Palette** - Quick access to all commands with Ctrl+P
- **Real-time Updates** - Automatic polling with smart refresh
- **Namespace Switching** - Easily switch between Temporal namespaces
- **Keyboard-first** - Full functionality without touching the mouse

## Prerequisites

- [Bun](https://bun.sh) runtime
- Temporal server with UI Server running at `http://localhost:8233`

```bash
# Start Temporal dev server (includes UI server)
temporal server start-dev
```

## Installation

```bash
bun install
```

## Usage

```bash
t9s
```

## Development

```bash
# Clone the repo
git clone https://github.com/chaptersix/t9s.git
cd t9s

# Install dependencies
bun install

# Start Temporal dev server (in a separate terminal)
temporal server start-dev

# Start the dev server
bun run dev

# Start with debug logging
DEBUG=true bun run dev

# Run tests
bun test

# Type check
bun run typecheck

# Seed sample workflows for testing (requires Temporal server)
bun run seed
```

Debug logs are written to `~/.temporal-tui.log` when `DEBUG=true` is set.

## Keybindings

### Navigation
| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `gg` | Go to top |
| `G` | Go to bottom |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |
| `Enter` | Select / Open |
| `Esc` | Back / Cancel |
| `Tab` | Next tab (in detail views) |

### Views
| Key | Action |
|-----|--------|
| `1` | Workflows |
| `2` | Schedules |
| `3` | Task Queues |
| `n` | Switch namespace |
| `Ctrl+P` | Command palette |
| `?` | Help |
| `q` | Quit |

### Workflow Actions
| Key | Action |
|-----|--------|
| `/` | Search workflows |
| `c` | Cancel workflow |
| `t` | Terminate workflow |
| `s` | Signal workflow |
| `Ctrl+R` | Refresh |

### Schedule Actions
| Key | Action |
|-----|--------|
| `p` | Pause / Unpause |
| `T` | Trigger now |
| `d` | Delete |

## Architecture

```
src/
├── app.ts              # Application entry and orchestration
├── components/         # UI components
│   ├── layout/         # Shell, StatusBar, TabBar, Footer
│   ├── overlay/        # CommandPalette, Modals, HelpOverlay
│   └── common/         # Table, FilterBar, Loading
├── views/              # Main views
│   ├── workflows/      # WorkflowList, WorkflowDetail
│   └── schedules/      # ScheduleList, ScheduleDetail
├── store/              # State management (Zustand-like)
├── data/temporal/      # Temporal HTTP client
├── input/              # Key handling
└── plugins/            # Plugin system
```

## Configuration

t9s connects to the Temporal UI Server HTTP API at `http://localhost:8233` by default.

## License

MIT
