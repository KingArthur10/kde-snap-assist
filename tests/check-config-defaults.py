"""Checks that every config key has the same default in contents/config/main.xml
(used by the settings dialog) and in the readConfig() calls of main.qml (used
when nothing has been saved yet), and that every key has a widget in config.ui."""
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NS = {"k": "http://www.kde.org/standards/kcfg/1.0"}


def normalise(kind, text):
    text = text.strip().strip('"')
    if kind == "bool":
        return text.lower() == "true"
    if kind in ("int", "uint"):
        return int(text)
    if kind == "double":
        return float(text)
    return text


def main():
    entries = {
        e.get("name"): (e.get("type").lower(), e.findtext("k:default", "", NS))
        for e in ET.parse(ROOT / "contents/config/main.xml").getroot().iter("{%s}entry" % NS["k"])
    }
    qml = (ROOT / "contents/ui/main.qml").read_text()
    code_defaults = dict(re.findall(r'read(?:Color)?Config\("(\w+)",\s*([^)]+)\)', qml))
    ui = (ROOT / "contents/ui/config.ui").read_text()

    problems = []
    for key, (kind, xml_default) in sorted(entries.items()):
        if key not in code_defaults:
            problems.append(f"{key}: in main.xml but never read in main.qml")
            continue
        if normalise(kind, xml_default) != normalise(kind, code_defaults[key]):
            problems.append(f"{key}: main.xml default {xml_default!r} != main.qml default {code_defaults[key].strip()!r}")
        if f'name="kcfg_{key}"' not in ui:
            problems.append(f"{key}: no kcfg_{key} widget in config.ui")
    for key in sorted(set(code_defaults) - set(entries)):
        problems.append(f"{key}: read in main.qml but missing from main.xml")

    for p in problems:
        print("config:", p)
    if not problems:
        print(f"config: {len(entries)} keys consistent")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
