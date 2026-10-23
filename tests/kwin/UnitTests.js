.import "../../contents/ui/code/layout.js" as Layout

// Pure-function tests for contents/ui/code/layout.js.

const AREA = { x: 0, y: 0, width: 1920, height: 1080 };
/// Panel at the top of a second screen: the maximize area is offset and shorter.
const OFFSET_AREA = { x: 1920, y: 44, width: 2560, height: 1396 };

function r(x, y, w, h) { return { x: x, y: y, width: w, height: h }; }

var tests = [
    {
        name: "layout: isNear tolerates fractional KWin geometry even at precision 0",
        run: function (t) {
            t.ok(Layout.isNear(960, 960.5, 0), "960 ~ 960.5");
            t.ok(!Layout.isNear(960, 962, 0), "960 !~ 962 at precision 0");
            t.ok(Layout.isNear(960, 970, 10), "configured precision widens the window");
        },
    },
    {
        name: "layout: left and right halves",
        run: function (t) {
            const left = Layout.detectSnap(r(0, 0, 960, 1080), AREA, 0);
            t.equal(left && left.mode, Layout.LayoutMode.VerticalSplit, "left half mode");
            t.rectNear(left.remaining[0], r(960, 0, 960, 1080), "left half leaves right half");

            const right = Layout.detectSnap(r(960, 0, 960, 1080), AREA, 0);
            t.equal(right.index, 1, "right half index");
            t.rectNear(right.remaining[0], r(0, 0, 960, 1080), "right half leaves left half");
        },
    },
    {
        name: "layout: top and bottom halves",
        run: function (t) {
            const top = Layout.detectSnap(r(0, 0, 1920, 540), AREA, 0);
            t.equal(top.mode, Layout.LayoutMode.HorizontalSplit, "top half mode");
            t.rectNear(top.remaining[0], r(0, 540, 1920, 540), "top leaves bottom");
            const bottom = Layout.detectSnap(r(0, 540, 1920, 540), AREA, 0);
            t.rectNear(bottom.remaining[0], r(0, 0, 1920, 540), "bottom leaves top");
        },
    },
    {
        name: "layout: quarters report the three remaining quarters in reading order",
        run: function (t) {
            const s = Layout.detectSnap(r(960, 0, 960, 540), AREA, 0);
            t.equal(s.mode, Layout.LayoutMode.Quarter, "mode");
            t.equal(s.index, 1, "top-right index");
            t.equal(s.remaining.length, 3, "three remaining");
            t.rectNear(s.remaining[0], r(0, 0, 960, 540), "first remaining is top-left");
            t.rectNear(s.remaining[2], r(960, 540, 960, 540), "last remaining is bottom-right");
        },
    },
    {
        name: "layout: thirds",
        run: function (t) {
            const s = Layout.detectSnap(r(640, 0, 640, 1080), AREA, 0);
            t.equal(s && s.mode, Layout.LayoutMode.Thirds, "middle third detected");
            t.equal(s.index, 1, "middle index");
            t.equal(s.remaining.length, 2, "two remaining thirds");
        },
    },
    {
        name: "layout: a resized (uneven) split leaves the rest of the screen",
        run: function (t) {
            /// a real 2560x1554 laptop screen after the divider was dragged to 40/60
            const area = r(0, 0, 2560, 1554);
            const left = Layout.detectSnap(r(0, 0, 1034, 1554), area, 0);
            t.equal(left && left.mode, Layout.LayoutMode.VerticalSplit, "left 40% is a vertical split");
            t.ok(left.custom, "flagged as a custom split");
            t.rectNear(left.remaining[0], r(1034, 0, 1526, 1554), "assist gets the right 60%");
            const right = Layout.detectSnap(r(1034, 0, 1526, 1554), area, 0);
            t.equal(right && right.index, 1, "right 60% index");
            t.rectNear(right.remaining[0], r(0, 0, 1034, 1554), "assist gets the left 40%");
            const top = Layout.detectSnap(r(0, 0, 2560, 600), area, 0);
            t.rectNear(top && top.remaining[0], r(0, 600, 2560, 954), "uneven top split leaves the bottom");
            t.ok(!Layout.detectSnap(r(0, 0, 960, 1080), AREA, 0).custom, "exact halves are not custom");
        },
    },
    {
        name: "layout: a quarter at a moved split point builds the other quarters from it",
        run: function (t) {
            const area = r(0, 0, 2560, 1554);
            const s = Layout.detectSnap(r(0, 0, 1034, 777), area, 0);
            t.equal(s && s.mode, Layout.LayoutMode.Quarter, "top-left corner is a quarter");
            t.equal(s.index, 0, "top-left index");
            t.ok(s.custom, "flagged as custom");
            t.rectNear(s.zones[1], r(1034, 0, 1526, 777), "top-right");
            t.rectNear(s.zones[2], r(0, 777, 1034, 777), "bottom-left");
            t.rectNear(s.zones[3], r(1034, 777, 1526, 777), "bottom-right");
            const br = Layout.detectSnap(r(1034, 777, 1526, 777), area, 0);
            t.equal(br && br.index, 3, "bottom-right corner window");
            t.rectNear(br.zones[0], r(0, 0, 1034, 777), "top-left built from its split");
        },
    },
    {
        name: "layout: coverage of a zone by a window",
        run: function (t) {
            const zone = r(960, 0, 960, 1080);
            t.equal(Layout.coverage(zone, zone), 1, "same rect covers fully");
            t.equal(Layout.coverage(zone, r(0, 0, 960, 1080)), 0, "touching neighbour covers nothing");
            t.ok(Layout.coverage(zone, r(968, 8, 944, 1064)) > 0.9, "tile with gaps still covers most");
            t.ok(Layout.coverage(zone, r(1000, 100, 640, 480)) < 0.5, "floating window covers little");
        },
    },
    {
        name: "layout: how much of a rect the windows above leave showing",
        run: function (t) {
            const left = r(0, 0, 960, 1080);
            t.equal(Layout.uncoveredFraction(left, []), 1, "nothing above shows all of it");
            t.equal(Layout.uncoveredFraction(left, [r(0, 0, 1920, 1080)]), 0, "maximized window above hides it");
            t.equal(Layout.uncoveredFraction(left, [r(960, 0, 960, 1080)]), 1, "neighbour does not cover it");
            t.equal(Layout.uncoveredFraction(left, [r(0, 0, 960, 540), r(0, 540, 960, 540)]), 0, "two quarters together hide it");
            t.equal(Layout.uncoveredFraction(left, [r(0, 0, 960, 700), r(0, 400, 960, 680)]), 0, "overlapping covers count once");
            t.equal(Layout.uncoveredFraction(left, [r(0, 0, 480, 1080)]), 0.5, "half covered");
            t.equal(Layout.uncoveredFraction(r(0, 0, 0, 0), [left]), 0, "empty rect has nothing showing");
        },
    },
    {
        name: "layout: offset maximize area (second screen, top panel)",
        run: function (t) {
            const s = Layout.detectSnap(r(1920, 44, 1280, 1396), OFFSET_AREA, 0);
            t.equal(s && s.mode, Layout.LayoutMode.VerticalSplit, "left half on offset screen");
            t.rectNear(s.remaining[0], r(3200, 44, 1280, 1396), "remaining is right half of that screen");
            t.equal(Layout.detectSnap(r(0, 0, 1280, 1396), OFFSET_AREA, 0), null, "same size on wrong screen is not a snap");
        },
    },
    {
        name: "layout: non-snapped geometries are ignored",
        run: function (t) {
            t.equal(Layout.detectSnap(r(100, 80, 640, 480), AREA, 0), null, "floating window");
            t.equal(Layout.detectSnap(r(0, 0, 1920, 1080), AREA, 0), null, "maximized window");
            t.equal(Layout.detectSnap(r(300, 0, 960, 1080), AREA, 0), null, "half width but not at an edge");
            t.equal(Layout.detectSnap(r(0, 100, 960, 1080), AREA, 0), null, "half width but shifted down");
        },
    },
    {
        name: "layout: fillGeometry grows a neighbour into freed space",
        run: function (t) {
            t.rectNear(Layout.fillGeometry(r(0, 540, 960, 540), r(0, 0, 960, 540), AREA, 0), r(0, 0, 960, 1080), "bottom-left grows up");
            t.rectNear(Layout.fillGeometry(r(0, 0, 960, 1080), r(960, 0, 960, 1080), AREA, 0), r(0, 0, 1920, 1080), "left half grows right");
            t.equal(Layout.fillGeometry(r(0, 0, 960, 540), r(960, 540, 960, 540), AREA, 0), null, "diagonal quarter does not grow");
        },
    },
    {
        name: "layout: rectsIntersect ignores touching edges",
        run: function (t) {
            t.ok(!Layout.rectsIntersect(r(0, 0, 960, 1080), r(960, 0, 960, 1080)), "adjacent halves");
            t.ok(Layout.rectsIntersect(r(0, 0, 961, 1080), r(960, 0, 960, 1080)), "1px overlap");
        },
    },
    {
        name: "layout: restoreSizeUnderCursor keeps the grab point",
        run: function (t) {
            // Window 960 wide grabbed at its horizontal middle, 15px below the top.
            const g = Layout.restoreSizeUnderCursor(r(0, 0, 960, 1080), { width: 640, height: 480 }, { x: 480, y: 15 });
            t.rectNear(g, r(160, 0, 640, 480), "centred under cursor, same top offset");
        },
    },
];
