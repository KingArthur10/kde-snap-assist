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
	@echo "make reload     install and run the new code now (no logout needed)"
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

# Disabling alone leaves the script running until KWin restarts, so unload it too.
disable:
	kwriteconfig6 --file kwinrc --group Plugins --key $(ID)Enabled false
	qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript $(ID) >/dev/null
	qdbus-qt6 org.kde.KWin /KWin reconfigure

# KWin compiles every script with one long-lived QML engine that caches files by
# URL, so unloading and loading the installed script again runs the old code until
# KWin restarts. Load a copy from a fresh path instead; KWin still reads the
# settings by plugin id, and the installed copy takes over at the next login.
DEV_DIR := $(or $(XDG_CACHE_HOME),$(HOME)/.cache)/$(ID)-dev
reload: install
	@stamp=$$(date +%s%N); dir="$(DEV_DIR)/$$stamp"; \
	qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript $(ID) >/dev/null && \
	find "$(DEV_DIR)" -mindepth 1 -maxdepth 1 -type d -exec rm -rf {} + 2>/dev/null; \
	mkdir -p "$$dir" && cp -r $(BUILD)/. "$$dir/" && \
	id=$$(qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadDeclarativeScript "$$dir/contents/ui/main.qml" $(ID)) && \
	qdbus-qt6 org.kde.KWin /Scripting/Script$$id org.kde.kwin.Script.run && \
	echo "reloaded $(ID) from $$dir"

uninstall: disable
	kpackagetool6 --type=KWin/Script --remove $(ID)

clean:
	rm -rf build dist
