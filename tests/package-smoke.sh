#!/bin/bash
# Installs the built package into a sandboxed XDG data dir, enables it the way
# System Settings does, starts a headless KWin and checks that KWin loaded it
# through metadata.json without QML errors. Never touches the real session.
#
# usage: tests/package-smoke.sh <package-dir>   (make builds build/<id>)
set -u
PKG=$(realpath "${1:?package dir}")
ID=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Id"])' "$PKG/metadata.json")

SANDBOX=$(mktemp -d -t kde-snap-assist-pkg.XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX"/{config,data,state,cache}

cat > "$SANDBOX/inner.sh" <<'EOF'
#!/bin/bash
set -u
kpackagetool6 --type=KWin/Script --install "$PKG" >/dev/null || { echo "FAIL: kpackagetool6 --install"; exit 1; }
kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" true
export QT_FORCE_STDERR_LOGGING=1 QT_LOGGING_RULES="js.debug=true;qml.debug=true;kwin_scripting.debug=true"
kwin_wayland --virtual --width 1280 --height 800 --socket "wayland-ksa-pkg-$$" \
    --no-lockscreen --no-global-shortcuts > "$XDG_STATE_HOME/kwin.log" 2>&1 &
KWIN=$!
for _ in $(seq 100); do qdbus-qt6 org.kde.KWin /Scripting >/dev/null 2>&1 && break; sleep 0.1; done
loaded=false
for _ in $(seq 30); do
    loaded=$(qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded "$ID" 2>/dev/null)
    [ "$loaded" = true ] && break
    sleep 0.2
done
sleep 1
kill $KWIN; wait 2>/dev/null
echo "LOADED=$loaded"
cat "$XDG_STATE_HOME/kwin.log"
EOF
chmod +x "$SANDBOX/inner.sh"

OUT=$(env -i HOME="$HOME" PATH="$PATH" XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" PKG="$PKG" ID="$ID" \
    XDG_CONFIG_HOME="$SANDBOX/config" XDG_DATA_HOME="$SANDBOX/data" \
    XDG_STATE_HOME="$SANDBOX/state" XDG_CACHE_HOME="$SANDBOX/cache" \
    timeout -k 5 60 dbus-run-session -- "$SANDBOX/inner.sh" 2>&1 < /dev/null)

ERRORS=$(echo "$OUT" | grep -E 'Component failed to load|kwin_scripting.*(rror|fail)|TypeError|ReferenceError|/'"$ID"'/.*:[0-9]+: ' | sort -u)
if ! echo "$OUT" | grep -q '^LOADED=true'; then
    echo "FAIL: KWin did not load the installed script '$ID'"
    echo "$OUT" | grep -iE 'script|qml|rror' | grep -vE 'a11y|portal' | head -20
    exit 1
fi
if [ -n "$ERRORS" ]; then
    echo "FAIL: script loaded with errors:"; echo "$ERRORS"
    exit 1
fi
echo "package: '$ID' installs and loads in KWin $(kwin_wayland --version | awk '{print $2}')"
