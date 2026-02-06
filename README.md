# Temporal TUI

Terminal UI for Temporal workflow orchestration, built with OpenTUI.

## Prerequisites

- Bun runtime
- Temporal server running with UI (`temporal server start-dev`)
  - UI Server accessible at http://localhost:8233

## Usage

```bash
# Install dependencies
bun install

# Start the TUI (runs until killed with Ctrl+C or 'q')
bun run dev

# Seed the dev server with sample workflows
bun run seed

# Type check
bun run typecheck

# Run tests
bun run test
```

## Keybindings

### Navigation
- `j/k` or `↓/↑` - Move up/down
- `gg` - Go to top
- `G` - Go to bottom
- `Ctrl+D/U` - Page down/up
- `Enter` - Select/open
- `Esc` - Back/cancel

### Workflow Actions
- `c` - Cancel workflow (graceful)
- `t` - Terminate workflow (immediate)
- `r` - Refresh

### Global
- `1-4` - Switch views
- `q` or `Ctrl+Q` - Quit
