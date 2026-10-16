function animateWindowPreviewToSelect(index, client){
    selecting = true;
    if (!immersiveMode) {
        selectClient(client);
        onClientSelect(client);
        return;
    }

    visibleWindowPreviews = [...visibleWindowPreviews, client];

    const item = windowPreviewsRepeater.itemAt(visibleWindowPreviews.length - 1);
    const thumbnail = clientsRepeater.itemAt(index);

    if (!item || !thumbnail) {
        /// nothing to animate, place the window right away
        selectClient(client);
        onClientSelect(client);
        return;
    }
    if (client.minimized) thumbnail.opacity = 1.0;
    const thumbnailGlobalCoords = thumbnail.mapToGlobal(0,0);

    /// set preview to fit corresponding thumbnail
    transitionDuration = 0;
    item.x = thumbnailGlobalCoords.x + 3 - minDx;
    item.y = thumbnailGlobalCoords.y + 32 - minDy;
    item.height = cardHeight - 40;
    item.width = cardWidth - 6;
    transitionDuration = transitionDurationOnAssistMove;

    setTimeout(function(){
        /// animate to selected new size
        item.x = mainWindow.x - (assistPadding / 2);
        item.y = mainWindow.y - (assistPadding / 2);
        item.width = mainWindow.width + assistPadding;
        item.height = mainWindow.height + assistPadding;

        /// actually select client
        selectClient(client);
        setTimeout(function(){
            onClientSelect(client);
        }, transitionDuration);
    }, 3);
}

function selectClient(client){
    client.setMaximize(false, false);
    client.shade = false;
    client.minimized = false;

    if (client.tile) {
        /// a window still attached to a KWin tile would keep that tile's geometry
        client.tile = null;
    } else if (rememberWindowSizes) {
        windowSizesBeforeSnap[client.internalId] = { height: client.height, width: client.width };
    }

    client.frameGeometry = immersiveMode ? Qt.rect(
        mainWindow.x - (assistPadding / 2) + minDx,
        mainWindow.y - (assistPadding / 2) + minDy,
        mainWindow.width + assistPadding,
        mainWindow.height + assistPadding
    ) : Qt.rect(
        main.x - (assistPadding / 2),
        main.y - (assistPadding / 2),
        main.width + assistPadding,
        main.height + assistPadding
    );
}

function onClientSelect(client){
    KWinComponents.Workspace.activeWindow = client;
    selecting = false;

    if (trackSnappedWindows) {
        removeWindowFromTrack(client.internalId); /// remove from track if was previously snapped
        trackSnapped(client);
    }

    AssistManager.checkToShowNextQuaterAssist(client);
}


/// listeners
/// Every connection is bound to `main`, so Qt drops it when the script is
/// unloaded. A plain connect(fn) outlives the script's QML context and makes
/// KWin crash the next time the signal fires.
function addListenersToClient(client) {
    if (!client || client.specialWindow || client.skipSwitcher || isOwnOverlay(client)) return;

    client.frameGeometryChanged.connect(main, function() {
        if (client.move || client.resize || activated || preventFromShowing) return;
        scheduleSnapCheck(client);
    });

    /// KWin may apply the snapped geometry while the move is still in progress
    client.interactiveMoveResizeFinished.connect(main, function() {
        if (!activated && !preventFromShowing) scheduleSnapCheck(client);
    });

    client.interactiveMoveResizeStarted.connect(main, function(){
        if (trackSnappedWindows && !client.resize)
            removeWindowFromTrack(client.internalId, function(group){
                if (fillOnSnappedMove) fillClosedWindow(client, group);
            });

        if (rememberWindowSizes && client.move) {
            const storedSize = windowSizesBeforeSnap[client.internalId];
            if (storedSize) {
                delete windowSizesBeforeSnap[client.internalId];
                client.frameGeometry = Layout.restoreSizeUnderCursor(client.frameGeometry, storedSize, KWinComponents.Workspace.cursorPos);
            }
        }
    });

    client.closed.connect(main, function(){
        handleWindowClose(client);
    });

    client.desktopsChanged.connect(main, function(){
        if (trackSnappedWindows && !client.resize) removeWindowFromTrack(client.internalId);
    });

    client.fullScreenChanged.connect(main, function(){
        /// leaving fullscreen restores a geometry that can look like a snap
        if (!client.fullScreen) AssistManager.preventAssistFromShowing();
    });

    client.minimizedChanged.connect(main, function() {
        if (!trackSnappedWindows || !minimizeSnappedTogether) return;
        const minimized = client.minimized;
        applyActionToAssosiatedSnapGroup(client, function(cl) {
            if (!cl || cl.minimized === minimized) return;
            cl.minimized = minimized;
            if (!minimized && trackActiveWindows) activationTime[cl.internalId] = Date.now();
        });
    });
}

function scheduleSnapCheck(client) {
    if (delayBeforeShowingAssist <= 0) {
        onWindowResize(client);
        return;
    }
    snapCheckTimer.pendingWindow = client;
    snapCheckTimer.interval = delayBeforeShowingAssist;
    snapCheckTimer.restart();
}

function onWindowResize(window) {
    if (activated || preventFromShowing || !window || window.deleted || window.specialWindow || !window.active) return;
    if (window.move || window.resize) return;

    const maxArea = KWinComponents.Workspace.clientArea(KWinComponents.Workspace.MaximizeArea, window);
    const snap = Layout.detectSnap(window.frameGeometry, maxArea, snapDetectPrecision);
    if (!snap) return;

    AssistManager.finishSnap(false); /// make sure we cleared all variables

    /// don't show assist if window could be fit in the group behind
    if (fitWindowInGroupBehind && windowFitsInSnapGroup(window)) return;

    currentScreenWidth = maxArea.width; currentScreenHeight = maxArea.height;
    minDx = maxArea.x; minDy = maxArea.y;

    /// store current window for animation
    if (immersiveMode) {
        currentWindowId = window.internalId;
        currentWindowPreview.x = window.x - minDx;
        currentWindowPreview.y = window.y - minDy;
        currentWindowPreview.width = window.width;
        currentWindowPreview.height = window.height;
    }

    layoutMode = snap.mode;
    switch (snap.mode) {
    case Layout.LayoutMode.VerticalSplit:
    case Layout.LayoutMode.HorizontalSplit: {
        columnsCount = snap.mode === Layout.LayoutMode.VerticalSplit ? 2 : 3;
        filteredClients.push(window);
        const zone = snap.remaining[0];
        AssistManager.delayedShowAssist(zone.x, zone.y, zone.height, zone.width, window);
        break;
    }
    case Layout.LayoutMode.Quarter:
    case Layout.LayoutMode.Thirds: {
        /// keys are zone positions, which switchAssistLayout() relies on
        const zones = snap.mode === Layout.LayoutMode.Quarter ? Layout.quarterZones(maxArea) : Layout.thirdZones(maxArea);
        quatersToShowNext = {};
        zones.forEach(function(zone, i) {
            if (i !== snap.index) quatersToShowNext[i] = { dx: zone.x, dy: zone.y, height: zone.height, width: zone.width };
        });
        AssistManager.checkToShowNextQuaterAssist(window);
        break;
    }
    }
}

function handleWindowFocus(window) {
    if (ignoreFocusChange || isOwnOverlay(window)) return;
    if (activated && !selecting) AssistManager.hideAssist(false);
    if (!window || window.specialWindow || window.skipSwitcher) return;

    /// Store timestamp of last window activation
    if (trackActiveWindows) activationTime[window.internalId] = Date.now();

    /// Raise all snapped windows together
    if (trackSnappedWindows && raiseSnappedTogether && !activated) {
        const group = snappedWindowGroups.find((group) => group.windows.includes(window.internalId));
        if (!group || group.windows.length < 2) return;

        ignoreFocusChange = true;
        group.windows.forEach(function(windowId) {
            if (windowId === window.internalId) return;
            const w = getClientFromId(windowId);
            if (w && !w.minimized) KWinComponents.Workspace.activeWindow = w;
        });

        KWinComponents.Workspace.activeWindow = window;
        setTimeout(function(){
            ignoreFocusChange = false;
        }, 100);
    }
}

function handleWindowClose(window){
    if (!window || window.specialWindow) return;
    if (trackActiveWindows) delete activationTime[window.internalId];
    if (rememberWindowSizes) delete windowSizesBeforeSnap[window.internalId];

    if (trackSnappedWindows) {
        /// remove window if it was snapped
        removeWindowFromTrack(window.internalId, function(group){
            /// callback when snapped window was closed.
            if (fillOnSnappedClose) fillClosedWindow(window, group);
        });
    }
}


/// for snap groups
function trackSnapped(client) {
    if (client && client.internalId && !snappedWindows.includes(client.internalId))
        snappedWindows.push(client.internalId);
}

function applyActionToAssosiatedSnapGroup(client, callback){
    if (!client || !client.internalId) return;

    const group = snappedWindowGroups.find((group) => group.windows.includes(client.internalId));
    if (group) group.windows.forEach(windowId => callback(getClientFromId(windowId)));
}

function removeWindowFromTrack(windowId, callback){
    /// Removes provided windowId from tracking of snapped windows
    if (!windowId) return;

    const i = snappedWindowGroups.findIndex(group => group.windows.includes(windowId));
    if (i < 0) return;

    const group = snappedWindowGroups[i];
    group.windows.splice(group.windows.indexOf(windowId), 1);
    if (callback) callback(group);

    if (group.windows.length < 1) {
        snappedWindowGroups.splice(snappedWindowGroups.indexOf(group), 1); /// delete empty group
    } else if (group.windows.length === 1) {
        /// delete group if not populated again in few seconds
        setTimeout(function(){
            const index = snappedWindowGroups.indexOf(group);
            if (index > -1 && group.windows.length < 2) snappedWindowGroups.splice(index, 1);
        }, 6000);
    }
}

function fillClosedWindow(closedWindow, group){
    /// fill the free area when snapped window closed or moved
    const closedWindowGeom = closedWindow.frameGeometry;
    const area = Layout.rect(minDx, minDy, currentScreenWidth, currentScreenHeight);
    const third = currentScreenWidth / 3;

    for (const windowId of group.windows) {
        const window = getClientFromId(windowId);
        if (!window || window.internalId === closedWindow.internalId) continue;
        const windowGeom = window.frameGeometry;
        if (!windowGeom) continue;

        /// special handling for 3-in-row layout
        /// when closed 3rd window, we don't want the first one to try filling it
        if (isEqual(closedWindowGeom.width, third) && isEqual(closedWindowGeom.x, minDx + third * 2)
                && isEqual(windowGeom.width, third) && isEqual(windowGeom.x, minDx))
            continue;

        const filled = Layout.fillGeometry(windowGeom, closedWindowGeom, area, snapDetectPrecision);
        if (filled) {
            AssistManager.preventAssistFromShowing();
            window.frameGeometry = Qt.rect(filled.x, filled.y, filled.width, filled.height);
            break;
        }
    }
}

function windowFitsInSnapGroup(client){
    /// determines if newly snapped window could be fit in group behind it
    /// requires track activation time and raise snapped windows together

    /// find last active client
    let lastActiveWindowId = null, lastActiveTime = -1;
    const activeClientId = KWinComponents.Workspace.activeWindow ? KWinComponents.Workspace.activeWindow.internalId : null;
    Object.keys(activationTime).forEach(function(key) {
        if (activationTime[key] > lastActiveTime && key != client.internalId && key != activeClientId) {
            const c = getClientFromId(key);
            if (c && !c.minimized && c.output === KWinComponents.Workspace.activeScreen && isOnCurrentDesktop(c)) {
                lastActiveWindowId = c.internalId;
                lastActiveTime = activationTime[key];
            }
        }
    });
    if (lastActiveWindowId === null) return false;

    /// find if it belongs to snap group
    const group = snappedWindowGroups.find((group) => group.windows.includes(lastActiveWindowId));
    if (!group) return false;

    /// check rest of windows in that group
    let intersectsWithAnyOtherWindow = false;

    for (let i = 0, l = group.windows.length; i < l; i++) {
        const w = getClientFromId(group.windows[i]);
        if (!w) continue;

        if (isEqual(w.y, client.y) && isEqual(w.height, client.height) && w.width > client.width) {
            /// reduce window width to fit new window in layout
            group.windows.push(client.internalId);
            AssistManager.preventAssistFromShowing();
            const g = w.frameGeometry;
            w.frameGeometry = Qt.rect(g.x + (isEqual(w.x, client.x) ? client.width : 0), g.y, g.width - client.width, g.height);
            return true;

        } else if (isEqual(w.x, client.x) && isEqual(w.width, client.width) && w.height > client.height) {
            /// reduce window height to fit new window in layout
            group.windows.push(client.internalId);
            AssistManager.preventAssistFromShowing();
            const g = w.frameGeometry;
            w.frameGeometry = Qt.rect(g.x, g.y + (isEqual(w.y, client.y) ? client.height : 0), g.width, g.height - client.height);
            return true;

        } else if (isEqual(w.x, client.x) && isEqual(w.y, client.y) && isEqual(w.height, client.height) && isEqual(w.width, client.width)) {
            /// replace window in group with newly snapped window
            group.windows.splice(i, 1);
            group.windows.push(client.internalId);
            return true;
        }

        if (!intersectsWithAnyOtherWindow && Layout.rectsIntersect(w.frameGeometry, client.frameGeometry))
            intersectsWithAnyOtherWindow = true;
    }

    /// if window does not intersect with other windows in the group, let it in
    if (!intersectsWithAnyOtherWindow) {
        group.windows.push(client.internalId);
        AssistManager.preventAssistFromShowing();
        return true;
    }

    return false;
}


/// utility functions
function isEqual(a, b) {
    /// tolerance helps with fractional geometry and scripts like Window Gap
    return Layout.isNear(a, b, snapDetectPrecision);
}

function getClientFromId(windowId){
    return KWinComponents.Workspace.windows.find((el) => el.internalId == windowId) || null;
}

function isOwnOverlay(client) {
    /// KWin's internal windows (this overlay included) have no client process or class
    return !!client && (client.caption === overlayTitle || (client.pid === -1 && !client.resourceClass));
}

function isOnCurrentDesktop(client) {
    return client.onAllDesktops || client.desktops.includes(KWinComponents.Workspace.currentDesktop);
}

function shouldShowWindow(client) {
    if (!client || client.deleted || isOwnOverlay(client)) return false;
    if (filteredClients.includes(client)) return false;
    if (client.active || client.specialWindow || client.skipSwitcher) return false;
    if (!showMinimizedWindows && client.minimized) return false;
    if (!showOtherScreensWindows && client.output !== KWinComponents.Workspace.activeScreen) return false;
    if (!showOtherDesktopsWindows && !isOnCurrentDesktop(client)) return false;
    if (!showSnappedWindows && snappedWindowGroups.some(group => group.windows.includes(client.internalId) && group.windows.length > 1)) return false;
    if (client.activities.length > 0 && !client.activities.includes(KWinComponents.Workspace.currentActivity)) return false;
    return true;
}

/// Oldest activation first; windows never activated come first.
function sortedByLastActive(list) {
    return list.slice().sort(function(a, b) {
        const timeA = activationTime[a.internalId], timeB = activationTime[b.internalId];
        if (timeA && !timeB) return 1;
        if (!timeA && timeB) return -1;
        return (timeA || 0) - (timeB || 0);
    });
}
