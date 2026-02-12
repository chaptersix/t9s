#!/usr/bin/env bash
set -euo pipefail

# Seed a local Temporal server with workflows from temporalio/samples-go.
# Starts workers for several sample types, then kicks off workflows.
#
# Usage:
#   ./dev/seed.sh           # start workers + seed workflows (workers keep running)
#   ./dev/seed.sh --stop    # stop background workers

REPO_URL="https://github.com/temporalio/samples-go.git"
CACHE_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev/samples-go"
PID_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev/pids"
LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev/logs"

SAMPLES=(helloworld timer child-workflow greetings saga cron)
TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-localhost:7233}"

stop_workers() {
    if [ ! -d "$PID_DIR" ]; then
        echo "No workers running."
        return
    fi
    for pidfile in "$PID_DIR"/*.pid; do
        [ -f "$pidfile" ] || continue
        pid=$(cat "$pidfile")
        name=$(basename "$pidfile" .pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null && echo "Stopped $name (pid $pid)" || true
        fi
        rm -f "$pidfile"
    done
    rmdir "$PID_DIR" 2>/dev/null || true
    echo "All workers stopped."
}

if [ "${1:-}" = "--stop" ]; then
    stop_workers
    exit 0
fi

# Check dependencies
if ! command -v go &>/dev/null; then
    echo "error: go is required but not found" >&2
    exit 1
fi

# Clone or update samples-go
if [ -d "$CACHE_DIR/.git" ]; then
    echo "Updating samples-go..."
    git -C "$CACHE_DIR" pull --ff-only -q 2>/dev/null || true
else
    echo "Cloning samples-go..."
    mkdir -p "$(dirname "$CACHE_DIR")"
    git clone --depth 1 -q "$REPO_URL" "$CACHE_DIR"
fi

# Stop any existing workers
stop_workers 2>/dev/null || true
mkdir -p "$PID_DIR" "$LOG_DIR"

# Start workers
echo ""
echo "Starting workers..."
for sample in "${SAMPLES[@]}"; do
    worker_dir="$CACHE_DIR/$sample/worker"
    if [ ! -d "$worker_dir" ]; then
        echo "  skip: $sample (no worker dir)"
        continue
    fi
    (cd "$CACHE_DIR" && go run "./$sample/worker") > "$LOG_DIR/$sample-worker.log" 2>&1 &
    pid=$!
    echo "$pid" > "$PID_DIR/$sample.pid"
    echo "  $sample worker started (pid $pid)"
done

# Wait for workers to register
sleep 2

# Run starters
echo ""
echo "Starting workflows..."

start_workflow() {
    local sample=$1
    local starter_dir
    # saga uses 'start/' instead of 'starter/'
    if [ -d "$CACHE_DIR/$sample/start" ]; then
        starter_dir="./$sample/start"
    elif [ -d "$CACHE_DIR/$sample/starter" ]; then
        starter_dir="./$sample/starter"
    else
        echo "  skip: $sample (no starter dir)"
        return
    fi
    (cd "$CACHE_DIR" && go run "$starter_dir") > "$LOG_DIR/$sample-starter.log" 2>&1 &
}

# Start multiple instances of samples that use unique IDs
for i in $(seq 1 5); do
    start_workflow helloworld
    start_workflow timer
    start_workflow child-workflow
    start_workflow greetings
done

# Saga uses a fixed ID, so only start once
start_workflow saga

# Cron workflows (these will keep running on a schedule)
for i in $(seq 1 3); do
    start_workflow cron
done

# Wait for starters to kick off
sleep 3

echo ""
echo "Seed complete. Workers are running in the background."
echo "  Logs: .dev/logs/"
echo "  Stop: ./dev/seed.sh --stop"
echo ""
