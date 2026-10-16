// Test runner, loaded by tests/session.sh as a KWin declarative script.
// Every test gets a fresh instance of the real script (contents/ui/main.qml)
// and a known arrangement of fixture windows.
import QtQuick
import org.kde.kwin as KWinComponents

import "Harness.js" as Harness
import "UnitTests.js" as UnitTests
import "IntegrationTests.js" as IntegrationTests

Item {
    id: runner

    readonly property var fixtureNames: ["Alpha", "Beta", "Gamma", "Delta"]
    readonly property var workspace: KWinComponents.Workspace
    property var sut: null
    property var sutComponent: null
    property var tests: []
    property int index: -1
    property var activeGenerator: null
    property var requestedSpawns: ({})
    readonly property bool screenshotsEnabled: KWin.readConfig("screenshots", false)

    Component { id: timerComponent; Timer { repeat: false } }

    function later(ms, fn) {
        const t = timerComponent.createObject(runner, { interval: Math.max(1, ms) });
        t.triggered.connect(function () { t.destroy(); fn(); });
        t.start();
    }

    // --- fixture helpers handed to every test as `env` -----------------------

    function win(name) {
        return workspace.windows.find(w => w.normalWindow && w.caption === name) || null;
    }

    function fixtureWindows() {
        return fixtureNames.map(win).filter(w => w);
    }

    function area(w) {
        return workspace.clientArea(KWinComponents.Workspace.MaximizeArea, w || workspace.activeWindow);
    }

    function quickTile(w, where) {
        workspace.activeWindow = w;
        workspace["slotWindowQuickTile" + where]();
    }

    function resetWindows() {
        fixtureWindows().forEach(function (w, i) {
            if (w.tile) w.tile = null;
            w.minimized = false;
            w.setMaximize(false, false);
            w.frameGeometry = Qt.rect(100 + i * 70, 80 + i * 50, 640, 480);
        });
        const first = win(fixtureNames[0]);
        if (first) workspace.activeWindow = first;
    }

    function createSut(config) {
        if (!sutComponent) sutComponent = Qt.createComponent("../../contents/ui/main.qml");
        if (sutComponent.status !== Component.Ready) throw new Error("cannot load SUT: " + sutComponent.errorString());
        return sutComponent.createObject(runner, { configOverrides: config || {} });
    }

    function destroySut() {
        if (sut) sut.destroy();
        sut = null;
    }

    // --- run loop ------------------------------------------------------------

    function step(t, value) {
        let r;
        try {
            r = activeGenerator.next(value);
        } catch (e) {
            t.fail("exception: " + e + (e.stack ? "\n" + e.stack : ""));
            return endTest();
        }
        if (r.done) return endTest();
        const y = r.value;
        if (typeof y === "number") return later(y, () => step(t));
        if (y && y.until) {
            const deadline = Date.now() + y.timeout;
            const poll = function () {
                let v = false;
                try { v = y.until(); } catch (e) { v = false; }
                if (v) return step(t, v);
                if (Date.now() > deadline) {
                    t.fail("timed out waiting for: " + y.what);
                    return endTest();
                }
                later(25, poll);
            };
            return poll();
        }
        t.fail("test yielded unsupported value " + y);
        endTest();
    }

    function endTest() {
        activeGenerator = null;
        destroySut();
        Harness.finishTest(index + 1, null);
        later(50, nextTest);
    }

    function nextTest() {
        index++;
        if (index >= tests.length) {
            Harness.finishRun(tests.length);
            return;
        }
        const test = tests[index];
        const t = Harness.makeContext(test.name);
        if (test.unit) {
            try { test.run(t); } catch (e) { t.fail("exception: " + e); }
            Harness.finishTest(index + 1, null);
            return later(1, nextTest);
        }
        ensureFixtures(Date.now() + 10000, function () { startIntegrationTest(test, t); });
    }

    function ensureFixtures(deadline, then) {
        const missing = fixtureNames.filter(n => !win(n));
        if (missing.length === 0) return then();
        if (Date.now() > deadline) {
            Harness.log("Bail out! fixture windows never appeared: " + missing.join(", "));
            return;
        }
        missing.filter(n => !requestedSpawns[n]).forEach(function (n) {
            requestedSpawns[n] = true;
            Harness.request("spawn", n);
        });
        later(100, () => ensureFixtures(deadline, then));
    }

    function startIntegrationTest(test, t) {
        requestedSpawns = {};
        resetWindows();
        later(400, function () {
            try {
                sut = createSut(test.config);
            } catch (e) {
                t.fail(String(e));
                return endTest();
            }
            const env = {
                sut: sut, workspace: workspace, win: win, area: area, quickTile: quickTile,
                fixtures: fixtureWindows,
                // types real keys through KWin's input stack, e.g. env.keys("Right", "Return")
                keys: function (...chords) { Harness.request("keys", chords.join(" ")); },
                // `yield env.screenshot(name)`: holds the scene until spectacle has captured it
                screenshot: function (name) {
                    if (!screenshotsEnabled) return 0;
                    Harness.request("screenshot", name);
                    return 2000;
                },
            };
            activeGenerator = test.run(t, env);
            later(200, () => step(t));
        });
    }

    Component.onCompleted: {
        const filter = KWin.readConfig("testFilter", "");
        const all = UnitTests.tests.map(t => Object.assign({ unit: true }, t)).concat(IntegrationTests.tests);
        tests = filter ? all.filter(t => new RegExp(filter).test(t.name)) : all;
        nextTest();
    }
}
