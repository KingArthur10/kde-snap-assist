# Developer tasks. Only `install`, `uninstall`, `enable`, `disable` and `reload`
# touch your Plasma session; `test` runs in a sandboxed, headless KWin.

ID      := $(shell python3 -I -c 'import json; print(json.load(open("metadata.json"))["KPlugin"]["Id"])')
VERSION := $(shell python3 -I -c 'import json; print(json.load(open("metadata.json"))["KPlugin"]["Version"])')
BUILD   := build/$(ID)
PACKAGE := dist/$(ID)-$(VERSION).kwinscript
SOURCES := metadata.json $(shell find contents -type f)

.PHONY: help check lint test package-test package install uninstall enable disable reload clean

help:
	@echo "make check      lint + tests (headless, does not touch your session)"
	@echo "make lint       qmllint and config consistency checks"
	@echo "make test       end-to-end tests in a sandboxed kwin_wayland --virtual"
	@echo "make package-test  install the package into a sandboxed KWin and check it loads"
	@echo "make package    build $(PACKAGE)"
	@echo "make install    install/upgrade the script for this user (kpackagetool6)"
	@echo "make enable     enable the script in KWin and reload it"
	@echo "make reload     restart the script after code changes"
	@echo "make disable    disable the script"
	@echo "make uninstall  disable and remove the script"

check: lint test package-test

lint:
	tests/lint.sh

test:
	tests/run-tests.sh

# Installs the real package into a sandbox and checks KWin loads it via metadata.json.
package-test: $(BUILD)
	tests/package-smoke.sh $(BUILD)

$(BUILD): $(SOURCES)
	rm -rf $(BUILD)
	mkdir -p $(BUILD)
	cp -r metadata.json contents $(BUILD)/
	touch $(BUILD)

package: $(PACKAGE)

$(PACKAGE): $(BUILD)
	mkdir -p dist
	rm -f $@
	cd $(BUILD) && zip -qr $(CURDIR)/$@ metadata.json contents
	@echo "built $@"

install: $(BUILD)
	@if kpackagetool6 --type=KWin/Script --show $(ID) >/dev/null 2>&1; then \
		kpackagetool6 --type=KWin/Script --upgrade $(BUILD); \
	else \
		kpackagetool6 --type=KWin/Script --install $(BUILD); \
	fi

enable:
	kwriteconfig6 --file kwinrc --group Plugins --key $(ID)Enabled true
	qdbus-qt6 org.kde.KWin /KWin reconfigure

disable:
	kwriteconfig6 --file kwinrc --group Plugins --key $(ID)Enabled false
	qdbus-qt6 org.kde.KWin /KWin reconfigure

# KWin only reloads a script's code when it is unloaded and loaded again.
reload: install
	qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript $(ID) >/dev/null
	qdbus-qt6 org.kde.KWin /KWin reconfigure

uninstall: disable
	kpackagetool6 --type=KWin/Script --remove $(ID)

clean:
	rm -rf build dist
