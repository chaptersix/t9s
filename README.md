# t9s

A terminal UI for [Temporal](https://temporal.io) -- like [k9s](https://k9scli.io) for Kubernetes.

Connects directly to the Temporal frontend gRPC service (no UI Server dependency).

## Features

- **Workflow Management** - Browse, filter, search, cancel, terminate, signal workflows
- **Schedule Management** - View, pause/unpause, trigger, delete scheduled workflows
- **Task Queue Info** - View pollers and worker info in workflow detail
- **Vim-style Navigation** - j/k, gg/G, Ctrl+D/U, and more
- **Real-time Updates** - Automatic polling with smart refresh
- **Namespace Switching** - Easily switch between Temporal namespaces
- **Cloud + Local** - Supports Temporal Cloud (API key + TLS), mTLS, and local dev server

## Prerequisites

- Rust toolchain (cargo)
- Temporal server running (local or Cloud)

## Build

```bash
git submodule update --init
cargo build --release
```

## Usage

```bash
# Local Temporal dev server (default: localhost:7233)
t9s

# Custom address and namespace
t9s --address localhost:7233 --namespace production

# Temporal Cloud
TEMPORAL_API_KEY=<key> t9s --address <ns>.tmprl.cloud:7233 --namespace <ns>

# mTLS
t9s --address temporal.example.com:7233 --tls-cert client.pem --tls-key client-key.pem
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TEMPORAL_ADDRESS` | Temporal server host:port | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | Default namespace | `default` |
| `TEMPORAL_API_KEY` | API key for Temporal Cloud | |
| `TEMPORAL_TLS_CERT` | Path to TLS client certificate | |
| `TEMPORAL_TLS_KEY` | Path to TLS client key | |
| `T9S_LOG_FILE` | Path to log file | |

## Keybindings

### Navigation
| Key | Action |
|-----|--------|
| `j` / Down | Move down |
| `k` / Up | Move up |
| `gg` | Go to top |
| `G` | Go to bottom |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |
| `Enter` | Select / Open |
| `Esc` | Back / Cancel |

### Views
| Key | Action |
|-----|--------|
| `1` | Workflows |
| `2` | Schedules |
| `:` | Command mode |
| `/` | Search |
| `?` | Help |
| `q` | Quit |

### Commands
| Command | Action |
|---------|--------|
| `:wf` | Switch to workflows |
| `:sch` | Switch to schedules |
| `:ns <name>` | Switch namespace |
| `:signal <name> [json]` | Signal selected workflow |
| `:q` | Quit |

### Workflow Actions
| Key | Action |
|-----|--------|
| `c` | Cancel workflow |
| `t` | Terminate workflow |
| `h` / `l` | Switch detail tabs |
| `Ctrl+R` | Refresh |

### Schedule Actions
| Key | Action |
|-----|--------|
| `p` | Pause/unpause schedule |
| `T` | Trigger schedule |
| `d` | Delete schedule |

### Workflow Detail
| Key | Action |
|-----|--------|
| `h` / `l` | Switch tabs |
| `Tab` / `Shift+Tab` | Switch tabs |

## Architecture

Elm architecture (App/Action/Update/Effect) with Ratatui + Crossterm + Tonic gRPC.

```
src/
├── main.rs            # Entry point, render loop, effect dispatch
├── app.rs             # App state, View/InputMode/Overlay enums, update()
├── action.rs          # Action enum
├── event.rs           # Terminal event handling, key-to-action mapping
├── worker.rs          # Async gRPC dispatch via channels
├── config.rs          # CLI args, env vars, TOML config
├── tui.rs             # Terminal setup/teardown
├── client/            # Temporal gRPC client
│   ├── traits.rs      # TemporalClient trait
│   └── grpc.rs        # tonic-based implementation
├── domain/            # Domain types (Workflow, Schedule, Namespace, etc.)
├── widgets/           # Ratatui widgets (status bar, tables, overlays)
├── input/             # Command definitions and parsing
└── proto/             # Generated protobuf code
```
