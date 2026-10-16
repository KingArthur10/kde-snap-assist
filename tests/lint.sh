#!/bin/bash
# Static checks: qmllint over every QML/JS file (config in .qmllint.ini), and
# config schema/default consistency. Needs qt6-qtdeclarative-devel.
set -u
cd "$(dirname "$0")/.."
QMLLINT=${QMLLINT:-$(command -v qmllint-qt6 || command -v qmllint || echo /usr/lib64/qt6/bin/qmllint)}
[ -x "$QMLLINT" ] || { echo "qmllint not found: sudo dnf install qt6-qtdeclarative-devel" >&2; exit 2; }

mapfile -t files < <(git ls-files --cached --others --exclude-standard '*.qml' '*.js')
out=$("$QMLLINT" --max-warnings 0 "${files[@]}" 2>&1)
status=$?
echo "$out" | grep -E '^(Warning|Error)' || true
[ $status -eq 0 ] && echo "lint: ${#files[@]} files clean"

python3 -I tests/check-config-defaults.py || status=1
exit $status
