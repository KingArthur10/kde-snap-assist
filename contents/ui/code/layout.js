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

function quarterZones(area) {
    const w = area.width / 2, h = area.height / 2;
    return [
        rect(area.x, area.y, w, h),
        rect(area.x + w, area.y, w, h),
        rect(area.x, area.y + h, w, h),
        rect(area.x + w, area.y + h, w, h),
    ];
}

function thirdZones(area) {
    const w = area.width / 3;
    return [0, 1, 2].map(i => rect(area.x + w * i, area.y, w, area.height));
}

/// Classifies a window geometry against the screen's maximize area.
/// Returns null when the window is not in a recognised snap position, otherwise
///   { mode: LayoutMode.*, index, zone, remaining: [rects] }
/// where `remaining` lists the empty zones, in the order assist should offer them.
function detectSnap(geom, area, tolerance) {
    const near = (a, b) => isNear(a, b, tolerance);
    const halfW = area.width / 2, halfH = area.height / 2;

    if (near(geom.width, halfW) && near(geom.height, area.height) && near(geom.y, area.y)) {
        if (near(geom.x, area.x))
            return { mode: LayoutMode.VerticalSplit, index: 0, zone: rect(area.x, area.y, halfW, area.height),
                     remaining: [rect(area.x + halfW, area.y, halfW, area.height)] };
        if (near(geom.x, area.x + halfW))
            return { mode: LayoutMode.VerticalSplit, index: 1, zone: rect(area.x + halfW, area.y, halfW, area.height),
                     remaining: [rect(area.x, area.y, halfW, area.height)] };
        return null;
    }

    if (near(geom.width, area.width) && near(geom.height, halfH) && near(geom.x, area.x)) {
        if (near(geom.y, area.y))
            return { mode: LayoutMode.HorizontalSplit, index: 0, zone: rect(area.x, area.y, area.width, halfH),
                     remaining: [rect(area.x, area.y + halfH, area.width, halfH)] };
        if (near(geom.y, area.y + halfH))
            return { mode: LayoutMode.HorizontalSplit, index: 1, zone: rect(area.x, area.y + halfH, area.width, halfH),
                     remaining: [rect(area.x, area.y, area.width, halfH)] };
        return null;
    }

    if (near(geom.width, halfW) && near(geom.height, halfH))
        return zonedSnap(LayoutMode.Quarter, quarterZones(area), geom, near);

    if (near(geom.width, area.width / 3) && near(geom.height, area.height) && near(geom.y, area.y))
        return zonedSnap(LayoutMode.Thirds, thirdZones(area), geom, near);

    return null;
}

function zonedSnap(mode, zones, geom, near) {
    const index = zones.findIndex(z => near(geom.x, z.x) && near(geom.y, z.y));
    if (index < 0) return null;
    return { mode: mode, index: index, zone: zones[index], remaining: zones.filter((z, i) => i !== index) };
}

/// Standard axis-aligned overlap test (touching edges do not count).
function rectsIntersect(a, b) {
    return a.x + a.width > b.x && a.x < b.x + b.width && a.y + a.height > b.y && a.y < b.y + b.height;
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
