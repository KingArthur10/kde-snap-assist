// End-to-end tests: real KWin, real script, real (GTK) client windows.
// Each test is a generator: yield a number to sleep, or t.until(...) to poll.
// Fixture windows Alpha, Beta, Gamma, Delta start floating with Alpha active.

/// Faster animations keep the suite quick without changing any logic paths.
const FAST = { transitionDuration: 40, delayBeforeShowingAssist: 50 };

function cfg(extra) { return Object.assign({}, FAST, extra || {}); }
function captions(list) { return list.map(w => w.caption); }
function r(x, y, w, h) { return { x: x, y: y, width: w, height: h }; }

/// Components the runtime only loads in some situations (e.g. DesktopBackground
/// needs a Plasma desktop window, which the headless session does not have).
const COMPONENTS = ["components/DesktopBackground.qml", "components/CornerButton.qml"];

var tests = [
    {
        name: "every QML component compiles (imports resolve on Qt 6 / KF6)",
        config: cfg(),
        run: function* (t, env) {
            for (const path of COMPONENTS) {
                const c = Qt.createComponent(Qt.resolvedUrl("../../contents/ui/" + path));
                yield t.until(() => c.status !== Component.Loading, path + " to compile");
                t.equal(c.status, Component.Ready, path + (c.status === Component.Error ? ": " + c.errorString() : ""));
            }
        },
    },
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
        name: "overlay opts out of KWin's close animation (no full-screen zoom-out ghost)",
        config: cfg(),
        run: function* (t, env) {
            for (const where of ["Left", "Right"]) {
                env.quickTile(env.win("Alpha"), where);
                yield t.until(() => env.sut.activated, "assist to activate (" + where + ")");
                const overlay = env.workspace.windows.find(w => w.caption === env.sut.overlayTitle);
                t.ok(overlay, "overlay is a KWin window while shown");
                if (overlay) t.ok(overlay.skipsCloseAnimation, "overlay skips close animation (" + where + ")");
                env.sut.dismiss();
                yield t.until(() => !env.sut.visible, "assist to close");
                yield 200;
            }
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
        name: "real keys reach the assist, not the snapped window behind it",
        config: cfg(),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Right");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 300;
            env.keys("Right");
            yield t.until(() => env.sut.focusedIndex === 1, "Right arrow to move the highlight", 3000);
            const chosen = env.sut.clients[1];
            env.keys("Return");
            yield t.until(() => !env.sut.activated, "Return to select", 3000);
            yield 200;
            t.rectNear(chosen && chosen.frameGeometry, r(0, 0, 960, 1080), "highlighted window fills the left half");
        },
    },
    {
        name: "real Escape closes the assist and gives the keyboard back",
        config: cfg(),
        run: function* (t, env) {
            const alpha = env.win("Alpha");
            env.quickTile(alpha, "Right");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 300;
            env.keys("Escape");
            yield t.until(() => !env.sut.activated, "Escape to dismiss", 3000);
            yield 300;
            t.equal(env.workspace.activeWindow, alpha, "snapped window has focus again");
        },
    },
    {
        name: "real Tab and Down keys reach the assist",
        config: cfg(),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 300;
            env.keys("Down");
            yield t.until(() => env.sut.focusedIndex === 2, "Down to move the highlight a row (two columns)", 3000);
            env.keys("Tab");
            yield t.until(() => Math.abs(env.sut.assistRect().height - 540) < 1, "Tab to switch to a quarter", 3000);
            t.rectNear(env.sut.assistRect(), r(960, 0, 960, 540), "assist now in the top-right quarter");
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
        name: "repeated dismiss during the cancel animation closes once",
        config: cfg({ transitionDuration: 300 }),
        run: function* (t, env) {
            env.quickTile(env.win("Alpha"), "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 400;
            env.sut.handleKey(Qt.Key_Escape);
            yield 50;
            env.sut.handleKey(Qt.Key_Escape);
            env.sut.dismiss();
            t.equal(env.sut.visibleWindowPreviews.length, 3, "one set of cancel previews");
            yield t.until(() => !env.sut.activated && !env.sut.visible, "assist to close");
            t.equal(env.workspace.activeWindow, env.win("Alpha"), "snapped window keeps focus");
            env.quickTile(env.win("Alpha"), "Right");
            yield t.until(() => env.sut.activated, "assist works again afterwards");
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
        name: "dragging the split between two snapped halves resizes both windows",
        config: cfg(),
        run: function* (t, env) {
            const alpha = env.win("Alpha");
            env.quickTile(alpha, "Left");
            yield t.until(() => env.sut.activated, "assist to activate");
            const chosen = env.sut.clients[0];
            env.sut.selectCandidate(0);
            yield t.until(() => !env.sut.activated, "assist to close");
            t.ok(chosen.tile && chosen.tile.parent === alpha.tile.parent, "chosen window joined the snapped window's tile layout");
            yield t.until(() => !env.sut.preventFromShowing, "post-selection suppression to end");
            yield 200;
            /// what dragging the shared edge does to the tiles
            alpha.tile.resizeByPixels(-192, Qt.RightEdge);
            yield t.until(() => Math.abs(chosen.x - 768) < 1, "chosen window to follow the split");
            t.rectNear(alpha.frameGeometry, r(0, 0, 768, 1080), "snapped window shrank");
            t.rectNear(chosen.frameGeometry, r(768, 0, 1152, 1080), chosen.caption + " grew into the rest");
            yield 400;
            t.ok(!env.sut.activated, "no assist: both windows were already snapped");
            alpha.tile.resizeByPixels(192, Qt.RightEdge);
        },
    },
    {
        name: "snapping into the last empty quarter does not offer the occupied ones",
        config: cfg(),
        run: function* (t, env) {
            const [alpha, beta, gamma, delta] = ["Alpha", "Beta", "Gamma", "Delta"].map(env.win);
            env.sut.preventFromShowing = true; /// arrange the other quarters without the assist
            env.quickTile(beta, "TopRight"); env.quickTile(gamma, "BottomLeft"); env.quickTile(delta, "BottomRight");
            yield 300;
            env.sut.preventFromShowing = false;
            env.quickTile(alpha, "TopLeft");
            yield 400;
            t.ok(!env.sut.activated, "no assist when every other quarter is taken");
        },
    },
    {
        name: "a quarter snap only offers the quarters that are still empty",
        config: cfg(),
        run: function* (t, env) {
            const [alpha, beta] = ["Alpha", "Beta"].map(env.win);
            env.sut.preventFromShowing = true;
            env.quickTile(beta, "TopRight");
            yield 300;
            env.sut.preventFromShowing = false;
            env.quickTile(alpha, "TopLeft");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 100;
            t.rectNear(env.sut.assistRect(), r(0, 540, 960, 540), "first offer skips the occupied top-right");
            env.sut.selectCandidate(0);
            yield t.until(() => {
                const a = env.sut.activated && env.sut.assistRect();
                return a && Math.abs(a.x - 960) < 1 && Math.abs(a.y - 540) < 1;
            }, "assist to move to bottom-right");
            env.sut.selectCandidate(0);
            yield t.until(() => !env.sut.activated, "assist to finish after the empty quarters");
        },
    },
    {
        name: "a maximized window behind a quarter snap does not fill the other quarters",
        config: cfg(),
        run: function* (t, env) {
            const [alpha, beta] = ["Alpha", "Beta"].map(env.win);
            env.sut.preventFromShowing = true;
            beta.setMaximize(true, true);
            yield 300;
            env.sut.preventFromShowing = false;
            env.quickTile(alpha, "TopRight");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 100;
            t.rectNear(env.sut.assistRect(), r(0, 0, 960, 540), "offers the top-left quarter");
            t.ok(env.sut.clients.includes(beta), "the maximized window is a candidate");
        },
    },
    {
        name: "a quarter snap next to a snapped half only offers the free quarter",
        config: cfg(),
        run: function* (t, env) {
            const [alpha, beta] = ["Alpha", "Beta"].map(env.win);
            env.sut.preventFromShowing = true;
            env.quickTile(beta, "Left");
            yield 300;
            env.sut.preventFromShowing = false;
            env.quickTile(alpha, "TopRight");
            yield t.until(() => env.sut.activated, "assist to activate");
            yield 100;
            t.rectNear(env.sut.assistRect(), r(960, 540, 960, 540), "offers only the bottom-right quarter");
            env.sut.selectCandidate(0);
            yield t.until(() => !env.sut.activated, "assist to finish after the one free quarter");
        },
    },
    {
        name: "a quarter snap next to a snapped half and quarter offers nothing",
        config: cfg(),
        run: function* (t, env) {
            const [alpha, beta, gamma] = ["Alpha", "Beta", "Gamma"].map(env.win);
            env.sut.preventFromShowing = true;
            env.quickTile(beta, "Left"); env.quickTile(gamma, "BottomRight");
            yield 300;
            env.sut.preventFromShowing = false;
            env.quickTile(alpha, "TopRight");
            yield 400;
            t.ok(!env.sut.activated, "no assist when the half and the quarter fill the rest");
        },
    },
    {
        name: "dragging the centre of four snapped quarters moves the whole cross",
        config: cfg(),
        run: function* (t, env) {
            const alpha = env.win("Alpha");
            env.quickTile(alpha, "TopLeft");
            const zones = [r(960, 0, 960, 540), r(0, 540, 960, 540), r(960, 540, 960, 540)];
            for (let i = 0; i < zones.length; i++) {
                const z = zones[i];
                yield t.until(() => {
                    const a = env.sut.activated && env.sut.assistRect();
                    return a && Math.abs(a.x - z.x) < 1 && Math.abs(a.y - z.y) < 1 && Math.abs(a.width - z.width) < 1;
                }, "assist #" + (i + 1) + " in place");
                env.sut.selectCandidate(0);
            }
            yield t.until(() => !env.sut.activated, "assist to finish");
            const all = env.fixtures();
            t.ok(all.every(w => w.tile && w.tile.parent === alpha.tile.parent), "all four windows share one tile layout");
            alpha.tile.resizeByPixels(-200, Qt.RightEdge);
            alpha.tile.resizeByPixels(-100, Qt.BottomEdge);
            yield t.until(() => all.every(w => !w.tile || Math.abs(w.x) < 1 || Math.abs(w.x - 760) < 1), "windows to follow");
            yield 100;
            const at = (x, y) => all.find(w => Math.abs(w.x - x) < 1 && Math.abs(w.y - y) < 1);
            t.ok(at(0, 0) && at(760, 0) && at(0, 440) && at(760, 440), "one window in each corner of the moved cross");
            t.rectNear(at(760, 440) && at(760, 440).frameGeometry, r(760, 440, 1160, 640), "bottom-right follows both axes");
            alpha.tile.resizeByPixels(200, Qt.RightEdge);
            alpha.tile.resizeByPixels(100, Qt.BottomEdge);
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
        name: "a quick tile split resized by the user still shows the assist in the rest",
        config: cfg(),
        run: function* (t, env) {
            const alpha = env.win("Alpha");
            env.quickTile(alpha, "Left");
            yield t.until(() => alpha.tile, "window to be tiled");
            /// what dragging the divider between two quick tiles does; KWin remembers it
            alpha.tile.resizeByPixels(-192, Qt.RightEdge);
            yield t.until(() => env.sut.activated, "assist to activate");
            t.rectNear(alpha.frameGeometry, r(0, 0, 768, 1080), "window took the resized tile");
            t.rectNear(env.sut.assistRect(), r(768, 0, 1152, 1080), "assist covers the rest of the screen");
            env.sut.dismiss();
            yield t.until(() => !env.sut.visible, "assist to hide");
            alpha.tile.resizeByPixels(192, Qt.RightEdge);
        },
    },
    {
        name: "a floating window pushed flush to an edge is not taken for an uneven snap",
        config: cfg(),
        run: function* (t, env) {
            env.win("Alpha").frameGeometry = Qt.rect(0, 0, 768, 1080);
            yield 400;
            t.ok(!env.sut.activated, "assist stayed hidden");
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
