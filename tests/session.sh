#!/bin/bash
# Inner half of run-tests.sh: runs inside the isolated D-Bus session.
# Starts a headless KWin, loads the test runner script and services its
# requests (spawning test windows, taking screenshots) until it finishes.
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
SOCK=wayland-ksa-test-$$
KWIN_LOG="$XDG_STATE_HOME/kwin.log"

export QT_FORCE_STDERR_LOGGING=1
export QT_LOGGING_RULES="js.debug=true;qml.debug=true;kwin_scripting.debug=true"

if [ -n "${KSA_SCREENSHOT_DIR:-}" ]; then
    kwriteconfig6 --file kwinrc --group Script-kdesnapassist-test --key screenshots --type bool true
fi
if [ -n "${KSA_TEST_FILTER:-}" ]; then
    kwriteconfig6 --file kwinrc --group Script-kdesnapassist-test --key testFilter "$KSA_TEST_FILTER"
fi

kwin_wayland --virtual --width 1920 --height 1080 --socket "$SOCK" \
    --no-lockscreen --no-global-shortcuts > "$KWIN_LOG" 2>&1 &
KWIN_PID=$!

cleanup() {
    jobs -p | xargs -r kill 2>/dev/null
    wait 2>/dev/null
    cat "$KWIN_LOG"
}
trap cleanup EXIT

for _ in $(seq 100); do
    qdbus-qt6 org.kde.KWin /Scripting >/dev/null 2>&1 && break
    kill -0 $KWIN_PID 2>/dev/null || { echo "kwin_wayland exited during startup"; exit 1; }
    sleep 0.1
done

spawn_window() {
    WAYLAND_DISPLAY=$SOCK GDK_BACKEND=wayland python3 -I "$HERE/testwin.py" "$1" >/dev/null 2>&1 &
}

ID=$(qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadDeclarativeScript \
    "$HERE/kwin/main.qml" kdesnapassist-test)
qdbus-qt6 org.kde.KWin "/Scripting/Script$ID" org.kde.kwin.Script.run

# The runner asks for things by logging "REQUEST <verb> <arg>"; handle each once.
handled=0
while kill -0 $KWIN_PID 2>/dev/null; do
    mapfile -t requests < <(sed -n 's/^qml: REQUEST //p' "$KWIN_LOG")
    while [ $handled -lt ${#requests[@]} ]; do
        read -r verb arg <<< "${requests[$handled]}"
        case "$verb" in
            spawn) spawn_window "$arg" ;;
            screenshot)
                if [ -n "$KSA_SCREENSHOT_DIR" ]; then
                    WAYLAND_DISPLAY=$SOCK spectacle -b -n -f -o "$KSA_SCREENSHOT_DIR/$arg.png" >/dev/null 2>&1 &
                fi ;;
        esac
        handled=$((handled + 1))
    done
    grep -qE '^qml: TAP (1\.\.[0-9]+|Bail out!)' "$KWIN_LOG" && break
    grep -q 'Component failed to load' "$KWIN_LOG" && break
    sleep 0.1
done
sleep 0.5
