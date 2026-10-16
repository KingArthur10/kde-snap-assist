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
