#!/usr/bin/env bash
set -euo pipefail

# Seed a local Temporal server with workflows from temporalio/samples-go.
# Starts workers for several sample types, then kicks off workflows and schedules.
#
# Usage:
#   ./dev/seed.sh           # start workers + seed workflows + create schedules
#   ./dev/seed.sh --stop    # stop workers and delete schedules

REPO_URL="https://github.com/temporalio/samples-go.git"
CLI_TAG="v1.6.2-standalone-activity"
CLI_VERSION="${CLI_TAG#v}"
CLI_RELEASE_URL="https://github.com/temporalio/cli/releases/tag/v1.6.2-standalone-activity"
BIN_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev/bin"
CACHE_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev/samples-go"
PID_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev/pids"
LOG_DIR="$(cd "$(dirname "$0")/.." && pwd)/.dev/logs"
SERVER_PID_FILE="$(cd "$(dirname "$0")/.." && pwd)/.dev/dev-server.pid"

SAMPLES=(helloworld timer child-workflow greetings saga cron)
STANDALONE_ACTIVITY_IDS=(
    "saa-demo-1"
    "saa-demo-2"
    "saa-demo-3"
    "saa-demo-4"
    "saa-demo-5"
)
TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-localhost:7233}"
PREVIEW_BIN="$BIN_DIR/temporal-$CLI_VERSION"
TEMPORAL_BIN="${TEMPORAL_BIN:-$PREVIEW_BIN}"

platform_name() {
    case "$(uname -s)" in
        Darwin) echo "darwin" ;;
        Linux) echo "linux" ;;
        *)
            echo "error: unsupported OS $(uname -s)" >&2
            exit 1
            ;;
    esac
}

platform_arch() {
    case "$(uname -m)" in
        x86_64|amd64) echo "amd64" ;;
        arm64|aarch64) echo "arm64" ;;
        *)
            echo "error: unsupported architecture $(uname -m)" >&2
            exit 1
            ;;
    esac
}

download_preview_cli() {
    mkdir -p "$BIN_DIR"

    local os arch archive url tmpdir
    os="$(platform_name)"
    arch="$(platform_arch)"
    archive="temporal_cli_${CLI_VERSION}_${os}_${arch}.tar.gz"
    url="https://github.com/temporalio/cli/releases/download/${CLI_TAG}/${archive}"
    tmpdir="$(mktemp -d)"

    echo "Downloading Temporal CLI preview $CLI_TAG..."
    curl -fLsS "$url" -o "$tmpdir/$archive"
    tar -xzf "$tmpdir/$archive" -C "$tmpdir"

    if [ ! -f "$tmpdir/temporal" ]; then
        echo "error: expected 'temporal' binary in release archive" >&2
        rm -rf "$tmpdir"
        exit 1
    fi

    mv "$tmpdir/temporal" "$PREVIEW_BIN"
    chmod +x "$PREVIEW_BIN"
    rm -rf "$tmpdir"
}

ensure_preview_cli() {
    # If caller provides TEMPORAL_BIN explicitly, use it as-is.
    if [ "$TEMPORAL_BIN" != "$PREVIEW_BIN" ]; then
        return
    fi

    if [ -x "$PREVIEW_BIN" ]; then
        local version
        version="$($PREVIEW_BIN --version 2>/dev/null || $PREVIEW_BIN version 2>/dev/null || true)"
        if [[ "$version" == *"$CLI_VERSION"* ]] || [[ "$version" == *"standalone-activity"* ]]; then
            return
        fi
    fi

    download_preview_cli
}

address_host() {
    echo "$TEMPORAL_ADDRESS" | awk -F: '{print $1}'
}

address_port() {
    echo "$TEMPORAL_ADDRESS" | awk -F: '{print $2}'
}

is_local_address() {
    local host
    host="$(address_host)"
    [ "$host" = "localhost" ] || [ "$host" = "127.0.0.1" ]
}

is_address_listening() {
    local port
    port="$(address_port)"
    [ -n "$port" ] && lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

start_dev_server_if_needed() {
    if ! is_local_address; then
        return
    fi

    if is_address_listening; then
        echo "Temporal server already running at $TEMPORAL_ADDRESS"
        return
    fi

    mkdir -p "$LOG_DIR" "$(dirname "$SERVER_PID_FILE")"
    echo "Starting Temporal dev server on default ports..."
    "$TEMPORAL_BIN" server start-dev >"$LOG_DIR/dev-server.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$SERVER_PID_FILE"

    sleep 2
    if ! kill -0 "$pid" >/dev/null 2>&1; then
        echo "error: failed to start dev server, see $LOG_DIR/dev-server.log" >&2
        exit 1
    fi

    if ! is_address_listening; then
        echo "error: dev server started but $TEMPORAL_ADDRESS is not listening" >&2
        echo "  see $LOG_DIR/dev-server.log" >&2
        exit 1
    fi

    echo "Temporal dev server started (pid $pid)"
}

stop_dev_server_if_started_by_script() {
    if [ ! -f "$SERVER_PID_FILE" ]; then
        return
    fi
    local pid
    pid="$(cat "$SERVER_PID_FILE")"
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
        echo "Stopped dev server (pid $pid)"
    fi
    rm -f "$SERVER_PID_FILE"
}

check_temporal_cli() {
    if ! command -v "$TEMPORAL_BIN" >/dev/null 2>&1 && [ ! -x "$TEMPORAL_BIN" ]; then
        echo "error: $TEMPORAL_BIN is required but not found" >&2
        echo "install preview release: $CLI_RELEASE_URL" >&2
        exit 1
    fi

    local version
    version="$($TEMPORAL_BIN --version 2>/dev/null || $TEMPORAL_BIN version 2>/dev/null || true)"
    if [[ "$version" != *"standalone-activity"* ]]; then
        echo "warning: expected standalone-activity Temporal CLI preview" >&2
        echo "  current: ${version:-unknown}" >&2
        echo "  recommended: $CLI_RELEASE_URL" >&2
    fi
}

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

cleanup_schedules() {
    echo "Cleaning up schedules..."
    local schedule_ids=(
        "greeting-every-5m"
        "hello-every-2m"
        "saga-hourly"
        "cron-every-10m"
        "timer-every-3m"
    )
    for sched_id in "${schedule_ids[@]}"; do
        "$TEMPORAL_BIN" schedule delete --schedule-id "$sched_id" 2>/dev/null && \
            echo "  Deleted $sched_id" || true
    done
}

cleanup_standalone_activities() {
    echo "Cleaning up standalone activities..."
    for activity_id in "${STANDALONE_ACTIVITY_IDS[@]}"; do
        "$TEMPORAL_BIN" activity terminate \
            --activity-id "$activity_id" \
            --reason "cleanup via t9s seed" >/dev/null 2>&1 && \
            echo "  Terminated $activity_id" || true
    done
}

if [ "${1:-}" = "--stop" ]; then
    ensure_preview_cli
    check_temporal_cli
    stop_workers
    stop_dev_server_if_started_by_script
    cleanup_schedules
    cleanup_standalone_activities
    exit 0
fi

# Check dependencies
if ! command -v go &>/dev/null; then
    echo "error: go is required but not found" >&2
    exit 1
fi

ensure_preview_cli
check_temporal_cli
start_dev_server_if_needed

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

# Create schedules
echo ""
echo "Creating schedules..."

SCHEDULE_IDS=(
    "greeting-every-5m"
    "hello-every-2m"
    "saga-hourly"
    "cron-every-10m"
    "timer-every-3m"
)

# Delete existing schedules to make script idempotent
for sched_id in "${SCHEDULE_IDS[@]}"; do
    "$TEMPORAL_BIN" schedule delete --schedule-id "$sched_id" 2>/dev/null || true
done

# Create fresh schedules
"$TEMPORAL_BIN" schedule create \
    --schedule-id "greeting-every-5m" \
    --type "GreetingWorkflow" \
    --task-queue "greetings" \
    --workflow-id "sched-greeting" \
    --interval "5m" 2>/dev/null || echo "  warning: failed to create greeting-every-5m"

"$TEMPORAL_BIN" schedule create \
    --schedule-id "hello-every-2m" \
    --type "Workflow" \
    --task-queue "hello-world" \
    --workflow-id "sched-hello" \
    --interval "2m" \
    --input '"Temporal"' 2>/dev/null || echo "  warning: failed to create hello-every-2m"

"$TEMPORAL_BIN" schedule create \
    --schedule-id "saga-hourly" \
    --type "TransferWorkflow" \
    --task-queue "saga" \
    --workflow-id "sched-saga" \
    --interval "1h" \
    --paused 2>/dev/null || echo "  warning: failed to create saga-hourly"

"$TEMPORAL_BIN" schedule create \
    --schedule-id "cron-every-10m" \
    --type "SampleCronWorkflow" \
    --task-queue "cron" \
    --workflow-id "sched-cron" \
    --cron "*/10 * * * *" 2>/dev/null || echo "  warning: failed to create cron-every-10m"

"$TEMPORAL_BIN" schedule create \
    --schedule-id "timer-every-3m" \
    --type "SampleTimerWorkflow" \
    --task-queue "timer" \
    --workflow-id "sched-timer" \
    --interval "3m" 2>/dev/null || echo "  warning: failed to create timer-every-3m"

echo "  5 schedules created"

echo ""
echo "Starting standalone activities..."
for activity_id in "${STANDALONE_ACTIVITY_IDS[@]}"; do
    "$TEMPORAL_BIN" activity start \
        --activity-id "$activity_id" \
        --type "SampleStandaloneActivity" \
        --task-queue "standalone-activity" \
        --start-to-close-timeout "10m" \
        --id-conflict-policy "UseExisting" \
        --input '{"source":"t9s-dev-seed"}' >/dev/null 2>&1 && \
        echo "  Started $activity_id" || \
        echo "  warning: failed to start $activity_id"
done

echo ""
echo "Seed complete. Workers are running in the background."
echo "  Logs: .dev/logs/"
echo "  Temporal CLI: $TEMPORAL_BIN"
echo "  Preview release: $CLI_RELEASE_URL"
echo "  Stop: ./dev/seed.sh --stop"
echo ""
