.pragma library

/// Pure geometry helpers: no QML/KWin state, so they can be unit tested.
/// Rects are plain {x, y, width, height} objects (Qt.rect values also work).

/// KWin 6 geometry is fractional (e.g. 680,308.5), so exact comparison is unreliable.
const MIN_TOLERANCE = 1;

const LayoutMode = {
    VerticalSplit: 0,   /// left/right halves
    Quarter: 1,
    HorizontalSplit: 2, /// top/bottom halves
    Thirds: 3,
};

function isNear(a, b, tolerance) {
    return Math.abs(a - b) <= Math.max(tolerance || 0, MIN_TOLERANCE);
}

function rect(x, y, width, height) {
    return { x: x, y: y, width: width, height: height };
}

/// Split point defaults to the centre; KWin 6 remembers quick tile splits the user
/// resized, so a snapped window can mark a different one.
function quarterZones(area, splitX, splitY) {
    const sx = splitX ?? area.x + area.width / 2, sy = splitY ?? area.y + area.height / 2;
    const right = area.x + area.width, bottom = area.y + area.height;
    return [
        rect(area.x, area.y, sx - area.x, sy - area.y),
        rect(sx, area.y, right - sx, sy - area.y),
        rect(area.x, sy, sx - area.x, bottom - sy),
        rect(sx, sy, right - sx, bottom - sy),
    ];
}

function thirdZones(area) {
    const w = area.width / 3;
    return [0, 1, 2].map(i => rect(area.x + w * i, area.y, w, area.height));
}

/// Classifies a window geometry against the screen's maximize area.
/// Returns null when the window is not in a recognised snap position, otherwise
///   { mode: LayoutMode.*, index, zone, zones, remaining: [rects], custom }
/// `zones` is the whole layout (index points at the window's zone), `remaining`
/// lists the empty zones in the order assist should offer them, and `custom` is
/// true when the split is not at the standard halves/quarters, which only a
/// tiled window should be trusted with.
function detectSnap(geom, area, tolerance) {
    const near = (a, b) => isNear(a, b, tolerance);
    const right = area.x + area.width, bottom = area.y + area.height;
    const geomRight = geom.x + geom.width, geomBottom = geom.y + geom.height;
    const atLeft = near(geom.x, area.x), atRight = near(geomRight, right);
    const atTop = near(geom.y, area.y), atBottom = near(geomBottom, bottom);
    const fullWidth = atLeft && atRight, fullHeight = atTop && atBottom;

    if (fullWidth && fullHeight) return null;

    if (fullHeight && near(geom.width, area.width / 3)) {
        const thirds = zonedSnap(LayoutMode.Thirds, thirdZones(area), geom, near);
        if (thirds) return thirds;
    }

    if (fullHeight && (atLeft || atRight)) {
        const zone = rect(geom.x, area.y, geom.width, area.height);
        const rest = atLeft ? rect(geomRight, area.y, right - geomRight, area.height)
                            : rect(area.x, area.y, geom.x - area.x, area.height);
        return { mode: LayoutMode.VerticalSplit, index: atLeft ? 0 : 1, zone: zone,
                 zones: atLeft ? [zone, rest] : [rest, zone], remaining: [rest],
                 custom: !near(geom.width, area.width / 2) };
    }

    if (fullWidth && (atTop || atBottom)) {
        const zone = rect(area.x, geom.y, area.width, geom.height);
        const rest = atTop ? rect(area.x, geomBottom, area.width, bottom - geomBottom)
                           : rect(area.x, area.y, area.width, geom.y - area.y);
        return { mode: LayoutMode.HorizontalSplit, index: atTop ? 0 : 1, zone: zone,
                 zones: atTop ? [zone, rest] : [rest, zone], remaining: [rest],
                 custom: !near(geom.height, area.height / 2) };
    }

    if ((atLeft || atRight) && (atTop || atBottom)) {
        const splitX = atLeft ? geomRight : geom.x, splitY = atTop ? geomBottom : geom.y;
        const snap = zonedSnap(LayoutMode.Quarter, quarterZones(area, splitX, splitY), geom, near);
        if (snap) snap.custom = !near(splitX, area.x + area.width / 2) || !near(splitY, area.y + area.height / 2);
        return snap;
    }

    return null;
}

function zonedSnap(mode, zones, geom, near) {
    const index = zones.findIndex(z => near(geom.x, z.x) && near(geom.y, z.y));
    if (index < 0) return null;
    return { mode: mode, index: index, zone: zones[index], zones: zones,
             remaining: zones.filter((z, i) => i !== index), custom: false };
}

/// Standard axis-aligned overlap test (touching edges do not count).
function rectsIntersect(a, b) {
    return a.x + a.width > b.x && a.x < b.x + b.width && a.y + a.height > b.y && a.y < b.y + b.height;
}

/// Fraction (0..1) of `zone` that `geom` covers.
function coverage(zone, geom) {
    const w = Math.min(zone.x + zone.width, geom.x + geom.width) - Math.max(zone.x, geom.x);
    const h = Math.min(zone.y + zone.height, geom.y + geom.height) - Math.max(zone.y, geom.y);
    const area = zone.width * zone.height;
    return w > 0 && h > 0 && area > 0 ? (w * h) / area : 0;
}

/// New geometry for a window that grows into the space `freed` left behind,
/// or null if `geom` does not share a full edge with it.
function fillGeometry(geom, freed, area, tolerance) {
    const near = (a, b) => isNear(a, b, tolerance);
    if (near(geom.x, freed.x) && near(geom.width, freed.width)) {
        const height = Math.min(geom.height + freed.height, area.height);
        return rect(geom.x, geom.y > freed.y ? geom.y - freed.height : geom.y, geom.width, height);
    }
    if (near(geom.y, freed.y) && near(geom.height, freed.height)) {
        const width = Math.min(geom.width + freed.width, area.width);
        return rect(geom.x > freed.x ? geom.x - freed.width : geom.x, geom.y, width, geom.height);
    }
    return null;
}

/// Geometry for an un-snapped window being dragged: restore `size` while keeping
/// the cursor at the same relative horizontal position, and the same distance
/// from the top edge (the title bar grab point) when it still fits.
function restoreSizeUnderCursor(geom, size, cursor) {
    const relX = geom.width > 0 ? (cursor.x - geom.x) / geom.width : 0.5;
    let offsetY = cursor.y - geom.y;
    if (offsetY > size.height) offsetY = geom.height > 0 ? size.height * offsetY / geom.height : 0;
    return rect(cursor.x - size.width * relX, cursor.y - offsetY, size.width, size.height);
}
