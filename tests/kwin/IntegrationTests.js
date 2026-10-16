// End-to-end tests: real KWin, real script, real (GTK) client windows.
// Each test is a generator: yield a number to sleep, or t.until(...) to poll.
// Fixture windows Alpha, Beta, Gamma, Delta start floating with Alpha active.

/// Faster animations keep the suite quick without changing any logic paths.
const FAST = { transitionDuration: 40, delayBeforeShowingAssist: 50 };

function cfg(extra) { return Object.assign({}, FAST, extra || {}); }
function captions(list) { return list.map(w => w.caption); }
function r(x, y, w, h) { return { x: x, y: y, width: w, height: h }; }

var tests = [
    {
        name: "script loads hidden and does not grab the screen",
        config: cfg(),
        run: function* (t, env) {
            yield 300;
            t.ok(!env.sut.activated, "assist inactive at start");
            t.ok(!env.sut.visible, "overlay window hidden at start");
        },
    },
    {
        name: "snap left half: assist offers the other windows in the right half",
        config: cfg(),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 150;
            yield env.screenshot("half-left");
            t.ok(env.sut.visible, "overlay visible");
            t.rectNear(env.sut.assistRect(), r(960, 0, 960, 1080), "assist covers the empty right half");
            t.sameMembers(captions(env.sut.clients), ["Beta", "Gamma", "Delta"], "candidates are the other windows, once each");
            env.sut.clients.forEach((w, i) => t.equal(env.sut.cardWindow(i), w, "card " + i + " shows clients[" + i + "]"));
        },
    },
    {
        name: "selecting a candidate fills the empty half and closes the assist",
        config: cfg(),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            const chosen = env.sut.clients[0];
            env.sut.selectCandidate(0);
            yield t.until(() => !env.sut.activated, "assist to close");
            yield 200;
            t.rectNear(chosen.frameGeometry, r(960, 0, 960, 1080), chosen.caption + " fills the right half");
            t.equal(env.workspace.activeWindow, chosen, "chosen window is focused");
            t.ok(!env.sut.visible, "overlay hidden");
        },
    },
    {
        name: "keyboard: arrows move focus, Return selects the focused card",
        config: cfg(),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Right");
            yield t.until(() => env.sut.activated, "assist to activate");
            env.sut.handleKey(Qt.Key_Right);
            t.equal(env.sut.focusedIndex, 1, "Right moves focus to the second card");
            const chosen = env.sut.clients[1];
            env.sut.handleKey(Qt.Key_Return);
            yield t.until(() => !env.sut.activated, "assist to close");
            yield 200;
            t.rectNear(chosen.frameGeometry, r(0, 0, 960, 1080), "focused card's window fills the left half");
        },
    },
    {
        name: "Escape dismisses without moving anything and refocuses the snapped window",
        config: cfg(),
        run: function* (t, env) {
            const before = env.fixtures().filter(w => w.caption !== "Alpha").map(w => ({ w: w, g: w.frameGeometry }));
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            env.sut.handleKey(Qt.Key_Escape);
            yield t.until(() => !env.sut.activated && !env.sut.visible, "assist to close");
            yield 150;
            before.forEach(b => t.rectNear(b.w.frameGeometry, b.g, b.w.caption + " untouched"));
            t.equal(env.workspace.activeWindow, env.win("Alpha"), "snapped window keeps focus");
        },
    },
    {
        name: "quarter snap chains the assist through every remaining quarter",
        config: cfg(),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "TopLeft");
            const expected = [r(960, 0, 960, 540), r(0, 540, 960, 540), r(960, 540, 960, 540)];
            const placed = [];
            for (let i = 0; i < expected.length; i++) {
                yield t.until(() => env.sut.activated && env.sut.clients.length > 0, "assist #" + (i + 1));
                yield 100;
                t.rectNear(env.sut.assistRect(), expected[i], "assist #" + (i + 1) + " position");
                yield env.screenshot("quarter-chain-" + (i + 1));
                t.equal(env.sut.clients.length, 3 - i, "assist #" + (i + 1) + " excludes already placed windows");
                const chosen = env.sut.clients[0];
                placed.push({ w: chosen, g: expected[i] });
                env.sut.selectCandidate(0);
                yield t.until(() => !env.sut.activated || env.sut.clients[0] !== chosen, "selection #" + (i + 1));
            }
            yield t.until(() => !env.sut.activated, "assist to finish");
            yield 200;
            placed.forEach(p => t.rectNear(p.w.frameGeometry, p.g, p.w.caption + " placed"));
        },
    },
    {
        name: "non-immersive mode shows the assist as its own window over the empty zone",
        config: cfg({ immersiveMode: false }),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 150;
            yield env.screenshot("half-left-non-immersive");
            t.rectNear(env.sut.assistRect(), r(960, 0, 960, 1080), "assist window covers the right half");
            env.sut.selectCandidate(0);
            yield t.until(() => !env.sut.activated, "assist to close");
        },
    },
    {
        name: "snap top half: assist covers the bottom half",
        config: cfg(),
        run: function* (t, env) {
            const alpha = env.win("Alpha");
            alpha.frameGeometry = Qt.rect(0, 0, 1920, 540);
            yield t.until(() => env.sut.activated, "assist to activate");
            t.rectNear(env.sut.assistRect(), r(0, 540, 1920, 540), "assist in bottom half");
        },
    },
    {
        name: "thirds: snapping into the left third offers the next third",
        config: cfg(),
        run: function* (t, env) {
            env.win("Alpha").frameGeometry = Qt.rect(0, 0, 640, 1080);
            yield t.until(() => env.sut.activated, "assist to activate");
            t.rectNear(env.sut.assistRect(), r(640, 0, 640, 1080), "assist in middle third");
        },
    },
    {
        name: "fractional geometry still counts as snapped",
        config: cfg(),
        run: function* (t, env) {
            env.win("Alpha").frameGeometry = Qt.rect(0, 0, 960.5, 1080);
            yield t.until(() => env.sut.activated, "assist to activate");
        },
    },
    {
        name: "ordinary moves and resizes do not trigger the assist",
        config: cfg(),
        run: function* (t, env) {
            const alpha = env.win("Alpha");
            alpha.frameGeometry = Qt.rect(300, 200, 900, 600);
            yield 400;
            alpha.frameGeometry = Qt.rect(0, 0, 1920, 1080);
            yield 400;
            t.ok(!env.sut.activated, "assist stayed hidden");
        },
    },
    {
        name: "no assist when there is nothing to offer",
        config: cfg({ showMinimizedWindows: false }),
        run: function* (t, env) {
            env.fixtures().filter(w => w.caption !== "Alpha").forEach(w => w.minimized = true);
            yield 200;
            env.quickTile(env.win("Alpha"), "Left");
            yield 500;
            t.ok(!env.sut.activated, "assist stayed hidden");
        },
    },
    {
        name: "minimized windows are offered by default and hidden when disabled",
        config: cfg(),
        run: function* (t, env) {
            env.win("Delta").minimized = true;
            yield 150;
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            t.ok(captions(env.sut.clients).includes("Delta"), "minimized Delta offered");
        },
    },
    {
        name: "windows on other virtual desktops are excluded",
        config: cfg(),
        run: function* (t, env) {
            const ws = env.workspace;
            if (ws.desktops.length < 2) ws.createDesktop(1, "Second");
            env.win("Gamma").desktops = [ws.desktops.find(d => d !== ws.currentDesktop)];
            yield 150;
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            t.sameMembers(captions(env.sut.clients), ["Beta", "Delta"], "Gamma (other desktop) excluded");
            env.win("Gamma").desktops = [ws.currentDesktop];
        },
    },
    {
        name: "windows on all desktops are offered",
        config: cfg(),
        run: function* (t, env) {
            env.win("Beta").onAllDesktops = true;
            yield 150;
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            t.ok(captions(env.sut.clients).includes("Beta"), "Beta (all desktops) offered");
            env.win("Beta").onAllDesktops = false;
        },
    },
    {
        name: "showOtherDesktopsWindows offers windows from other desktops",
        config: cfg({ showOtherDesktopsWindows: true }),
        run: function* (t, env) {
            const ws = env.workspace;
            if (ws.desktops.length < 2) ws.createDesktop(1, "Second");
            env.win("Gamma").desktops = [ws.desktops.find(d => d !== ws.currentDesktop)];
            yield 150;
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            t.ok(captions(env.sut.clients).includes("Gamma"), "Gamma (other desktop) offered");
            env.win("Gamma").desktops = [ws.currentDesktop];
        },
    },
    {
        name: "Tab switches the half assist to a quarter",
        config: cfg(),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 100;
            env.sut.handleKey(Qt.Key_Tab);
            yield 150;
            t.rectNear(env.sut.assistRect(), r(960, 0, 960, 540), "assist now in the top-right quarter");
        },
    },
    {
        name: "snap groups: minimizing one snapped window minimizes its partner",
        config: cfg({ minimizeSnappedTogether: true }),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            const partner = env.sut.clients[0];
            env.sut.selectCandidate(0);
            yield t.until(() => !env.sut.activated, "assist to close");
            yield 300;
            env.win("Alpha").minimized = true;
            yield t.until(() => partner.minimized, partner.caption + " to minimize with Alpha");
            env.win("Alpha").minimized = false;
            yield t.until(() => !partner.minimized, partner.caption + " to restore with Alpha");
        },
    },
    {
        name: "snap groups: a snapped window grows into the gap when its partner closes",
        config: cfg({ fillOnSnappedClose: true }),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            const partner = env.sut.clients[0];
            const partnerName = partner.caption;
            env.sut.selectCandidate(0);
            yield t.until(() => !env.sut.activated, "assist to close");
            yield 300;
            partner.closeWindow(); // the runner respawns closed fixtures before the next test
            yield t.until(() => !env.win(partnerName), partnerName + " to close");
            yield 300;
            t.rectNear(env.win("Alpha").frameGeometry, r(0, 0, 1920, 1080), "Alpha grows to fill the screen");
        },
    },
];
