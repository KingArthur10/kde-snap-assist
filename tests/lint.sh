#!/bin/bash
# Static checks: qmllint for QML (config in .qmllint.ini) and a syntax check of
# every JS file through qmllint's JS parser. Needs qt6-qtdeclarative-devel.
set -u
cd "$(dirname "$0")/.."
QMLLINT=${QMLLINT:-$(command -v qmllint-qt6 || command -v qmllint || echo /usr/lib64/qt6/bin/qmllint)}
[ -x "$QMLLINT" ] || { echo "qmllint not found: sudo dnf install qt6-qtdeclarative-devel" >&2; exit 2; }

mapfile -t files < <(git ls-files --cached --others --exclude-standard '*.qml' '*.js')
out=$("$QMLLINT" --max-warnings 0 "${files[@]}" 2>&1)
status=$?
echo "$out" | grep -E '^(Warning|Error)' || true
[ $status -eq 0 ] && echo "lint: ${#files[@]} files clean"
exit $status
