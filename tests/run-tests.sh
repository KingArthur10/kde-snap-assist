#!/bin/bash
# Runs the test suite inside a throwaway, headless KWin (kwin_wayland --virtual)
# on its own D-Bus session, so the user's live desktop is never touched.
#
# usage: tests/run-tests.sh [--screenshot DIR] [--filter REGEX] [--verbose]
#
# Exit status: 0 if every TAP test passed, 1 otherwise.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
SCREENSHOT_DIR=""
FILTER=""
VERBOSE=0
TIMEOUT=${KSA_TEST_TIMEOUT:-180}

while [ $# -gt 0 ]; do
    case "$1" in
        --screenshot) SCREENSHOT_DIR=$(realpath -m "$2"); shift 2 ;;
        --filter) FILTER=$2; shift 2 ;;
        --verbose) VERBOSE=1; shift ;;
        -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

for tool in kwin_wayland dbus-run-session qdbus-qt6 python3; do
    command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 2; }
done

# Isolate every XDG location: a nested KWin otherwise writes its virtual output,
# tiling layouts and shortcuts into the real ~/.config.
SANDBOX=$(mktemp -d -t kde-snap-assist-test.XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX"/{config,data,state,cache}
[ -n "$SCREENSHOT_DIR" ] && mkdir -p "$SCREENSHOT_DIR"

LOG="$SANDBOX/session.log"
env -i HOME="$HOME" PATH="$PATH" USER="${USER:-}" LANG="${LANG:-C.UTF-8}" \
    XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
    XDG_CONFIG_HOME="$SANDBOX/config" XDG_DATA_HOME="$SANDBOX/data" \
    XDG_STATE_HOME="$SANDBOX/state" XDG_CACHE_HOME="$SANDBOX/cache" \
    KSA_TEST_FILTER="$FILTER" KSA_SCREENSHOT_DIR="$SCREENSHOT_DIR" \
    timeout -k 5 "$TIMEOUT" dbus-run-session -- "$HERE/session.sh" > "$LOG" 2>&1 < /dev/null
SESSION_STATUS=$?

if [ "$VERBOSE" = 1 ]; then
    grep -vE 'dbus-daemon|a11y|AT-SPI|propertyCache|portal|qtvirtualkeyboard' "$LOG"
fi

# Lines from the test script are prefixed with "TAP " (see tests/kwin/Harness.js).
TAP=$(sed -n 's/^qml: TAP //p' "$LOG")
echo "$TAP"

ERRORS=$(grep -E 'Component failed to load|TypeError|ReferenceError|SyntaxError|is not a function|Cannot (read|assign)|Unable to assign|qrc:|file://.*:[0-9]+: ' "$LOG" \
    | grep -v '^qml: TAP ' | sort -u)
if [ -n "$ERRORS" ]; then
    echo "# QML/JS errors during the run:"
    echo "$ERRORS" | sed 's/^/#   /'
fi

if [ $SESSION_STATUS -eq 124 ] || [ $SESSION_STATUS -eq 137 ]; then
    echo "Bail out! test session timed out after ${TIMEOUT}s"
    exit 1
fi
if ! echo "$TAP" | grep -q '^1\.\.[0-9]'; then
    echo "Bail out! test runner never finished (no TAP plan line); rerun with --verbose"
    exit 1
fi
if echo "$TAP" | grep -q '^not ok' || [ -n "$ERRORS" ]; then
    exit 1
fi
exit 0
