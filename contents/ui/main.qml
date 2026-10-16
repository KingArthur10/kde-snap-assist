/// Ideas:
/// - refactor all complex height/width calculations to use simple 12x12 virtual grid
/// - "skip layout" button, which would allow to skip to next assist position from the quatersToShowNext
/// - support for search field, and maybe Krunner to launch new apps
/// - restore previous size on un-snapping of programatically snapped window
/// - create task switcher widget which will visually show windows tiled using this assist, allowing to minimize/restore them at once (not possible yet)

import QtQuick
import QtQuick.Window
import QtQuick.Controls
import org.kde.kirigami as Kirigami
import org.kde.kwin as KWinComponents

import "components"
import "./code/assist.js" as AssistManager
import "./code/keyboard.js" as KeyboardManager
import "./code/windows.js" as WindowManager
/// The code/*.js files run in this document's scope and use every namespace
/// imported here, including Layout, which this file does not reference itself.
import "./code/layout.js" as Layout // qmllint disable unused-imports

Window {
    id: main
    /// KWin lists this overlay in Workspace.windows like any other window;
    /// the title lets WindowManager recognise it and never offer it as a candidate.
    readonly property string overlayTitle: "kde-snap-assist-overlay"
    title: overlayTitle
    /// KWin 6 only routes real key presses to its internal windows when they are tool
    /// (or popup) windows; as a plain window the keys went to the window behind it.
    flags: Qt.Tool | Qt.FramelessWindowHint
    visible: false
    color: "transparent"

    /// Config values that win over KWin.readConfig (used by the test suite).
    property var configOverrides: ({})

    /// service variables
    property bool activated: false
    property var clients: null /// filtered clients to show in the grid
    property var allClients: null /// all clients fetched on assist reveal
    property var desktopWindowId: null
    property var currentWindowId: null
    property var lastActiveClient: null /// last active client to focus if cancelled
    property int focusedIndex: 0 /// selection by keyboard
    property bool trackActiveWindows: true
    property var activationTime: ({}) /// store timestamps of last window's activation
    property var windowSizesBeforeSnap: ({}) /// store widnow sizes before they were snapped via script (when rememberWindowSizes is on)
    property int cardHeight: 220 /// calculated dynamically before assist reveal
    property int cardWidth: 370
    property int columnsCount: 2 /// calculated depending on available width
    property int gridSpacing: 25 /// maybe should be configurable?
    property bool cycleKeyboard: false /// not in use
    property bool preventFromShowing: false /// flag used to temporarly prevent assist from showing when not desired
    property bool selecting: false /// a candidate is being placed; its activation must not close the assist
    property bool cancelling: false /// the cancel animation is running

    property int transitionDurationOnAssistMove: 0 /// separate transition duration when moving assist window with the Tab key
    property var visibleWindowPreviews: ([]) /// stores windows which should be constantly displayed (snapped windows)
    property var notificationPreviews: ([]) /// stores notification windows which should be displayed above
    property bool showRegularGridPreviews: true /// used for seamless switch between animated and static window previews

    /// for tracking snapped windows
    property bool trackSnappedWindows: true
    property var snappedWindowGroups: ([]) /// store snapped windows in groups
    property var snappedWindows: ([]) /// temporarly store windows which will be added in group on finish
    property bool ignoreFocusChange: false /// prevent endless loop for raiseSnappedTogether

    /// for quater tiling
    property var quatersToShowNext: ({}) /// store next quaters to show assist after selection
    property var filteredClients: ([]) /// clients to filter (which are already snapped in current flow)
    property var filteredQuaters: ([]) /// quaters to ignore during iteration (occupied by big window)
    property int currentScreenWidth: 1
    property int currentScreenHeight: 1
    property int minDx: 0 /// store the real "0" dx coordinate
    property int minDy: 0
    property int assistPadding: 0  /// padding to add around assist (not applied to windows)
    property int layoutMode: 0 /// 0 - horizontal halve, 1 - quater, 2 - vertical halve
    property var storedQuaterPosition: ({}) /// store initial quater position for Tab button switching
    property var storedFirstQuaterToShow: ({}) /// store planned first quater for Tab button switching

    /// configurable
    property int transitionDuration
    property color cardColor
    property color hoveredCardColor
    property color backdropColor
    property color textColor
    property int borderRadius
    property bool sortByLastActive
    property bool showMinimizedWindows
    property bool showOtherScreensWindows
    property bool showOtherDesktopsWindows
    property bool descendingOrder
    property int snapDetectPrecision
    property int delayBeforeShowingAssist
    property bool showSnappedWindows
    property bool minimizeSnappedTogether
    property bool raiseSnappedTogether
    property bool fillOnSnappedClose
    property bool fillOnSnappedMove
    property bool fitWindowInGroupBehind
    property bool rememberWindowSizes
    property bool showDesktopBackground
    property int desktopBackgroundBlur
    property bool immersiveMode
    property double opacityForMinimized
    property bool debugLogging

    Connections {
        target: KWinComponents.Workspace
        function onWindowActivated(window) {
            if (!window) return;
            WindowManager.handleWindowFocus(window);
        }
        function onWindowAdded(window) {
            WindowManager.addListenersToClient(window);
        }
        function onVirtualScreenSizeChanged(){
            /// Fix for assist getting shown when screen size changed
            AssistManager.preventAssistFromShowing(1000, () => AssistManager.hideAssist(false));
        }
    }

    /// KWin restarts the script when its settings are saved, so this is a fallback
    Connections {
        target: KWinComponents.Options
        function onConfigChanged() { loadConfigs(); }
    }

    Component.onCompleted: {
        loadConfigs();
        const windows = KWinComponents.Workspace.windows;
        for (let i = 0; i < windows.length; ++i) {
            WindowManager.addListenersToClient(windows[i]);
        }
        debugLog("started, watching", windows.length, "windows");
    }

    /// Desktop preview on background
    Loader {
        source: !immersiveMode && showDesktopBackground && desktopWindowId != null ? 'components/DesktopBackground.qml' : ''
    }

    Loader {
        active: immersiveMode && desktopWindowId != null
        sourceComponent: Item {
            y: 0
            x: 0
            height: Screen.height
            width: currentScreenWidth
            visible: showDesktopBackground && activated

            KWinComponents.WindowThumbnail {
                wId: desktopWindowId
                id: desktopBackground
                anchors.fill: parent
            }
        }
    }

    /// click on empty space to close
    MouseArea {
        anchors.fill: parent
        onClicked: main.dismiss()
    }

    /// Main view
    Item {
        id: mainWindow
        width: 1
        height: 1
        clip: true
        anchors.fill: immersiveMode ? null : parent

        /// Blurred clipped part of background
        Loader {
            source: immersiveMode && showDesktopBackground && desktopWindowId != null ? 'components/DesktopBackground.qml' : ''
        }

        /// Backdrop color
        Rectangle {
            anchors.fill: parent
            border.color: "#75475057"
            border.width: immersiveMode ? 1 : 0
            color: backdropColor
        }

        /// fade-in animation on appear
        NumberAnimation {
            id: fadeInAnimation
            target: mainWindow
            property: "opacity"
            from: 0
            to: 1
            duration: transitionDuration
        }

        /// fade-out animation on cancel (played only in 'fullscreen background' mode)
        NumberAnimation {
            id: fadeOutAnimation
            target: mainWindow
            property: "opacity"
            from: 1
            to: 0
            duration: transitionDuration
        }

        /// transition on moving assist around
        Behavior on x { PropertyAnimation {duration: transitionDurationOnAssistMove; easing.type: Easing.OutExpo } }
        Behavior on y { PropertyAnimation {duration: transitionDurationOnAssistMove; easing.type: Easing.OutExpo} }
        Behavior on width { PropertyAnimation {duration: transitionDurationOnAssistMove; easing.type: Easing.OutExpo} }
        Behavior on height { PropertyAnimation {duration: transitionDurationOnAssistMove; easing.type: Easing.OutExpo} }

        ScrollView {
            id: scrollView
            anchors.centerIn: parent
            height: gridView.height > mainWindow.height * 0.95 ? mainWindow.height * 0.95 : gridView.height
            width: columnsCount * (cardWidth + gridSpacing)

            Grid {
                id: gridView
                columns: columnsCount
                spacing: gridSpacing
                anchors.centerIn: parent

                Repeater {
                    id: clientsRepeater
                    model: clients

                        Rectangle {
                            id: clientItem
                            readonly property var window: modelData
                            color: cardColor
                            radius: borderRadius
                            width:  cardWidth
                            height: cardHeight
                            border.color: activePalette.highlight
                            border.width: focusedIndex == index ? 3 : 0
                            visible: true
                            opacity: modelData.minimized ? opacityForMinimized : 1.0

                            Column {
                                anchors.horizontalCenter: parent.horizontalCenter

                                Rectangle {
                                    height: 8
                                    width: 12
                                    color: "transparent"
                                }

                                /// window title and icon
                                Row {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    bottomPadding: 8
                                    width: cardWidth - 10

                                    Rectangle {
                                        height: 8
                                        width: 15
                                        color: "transparent"
                                    }

                                    Kirigami.Icon {
                                        id: icon
                                        height: 12 // PlasmaCore.Units.iconSizes.medium?
                                        width: 12
                                        source: modelData.icon
                                    }

                                    Text {
                                        text: modelData.caption
                                        leftPadding: 7
                                        color: textColor
                                        elide: Text.ElideRight
                                        width: parent.width - 26
                                    }
                                }

                                /// window thumbnail
                                KWinComponents.WindowThumbnail {
                                    anchors.horizontalCenter: parent.horizontalCenter
                                    id: clientThumbnail
                                    wId: modelData.internalId
                                    clip: true
                                    visible: activated && (showRegularGridPreviews || modelData.minimized)
                                    width: cardWidth - 6
                                    height: cardHeight - 40
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onEntered: {
                                    clientItem.color = hoveredCardColor;
                                }
                                onExited: {
                                    clientItem.color = cardColor;
                                }
                                onClicked: main.selectCandidate(index)
                            }

                            Behavior on opacity { PropertyAnimation {duration: transitionDuration } }
                        }
                    }
            }
        }

        /// Close assist button
        CornerButton {
            id: closeButton
            y: 20
            icon.name: "window-close"
            ToolTip.text: qsTr("Close snap assist (Esc)")
            onClicked: main.dismiss()
        }

        /// Change layout button
        CornerButton {
            id: changeSizeButton
            y: 60

            Image {
                anchors.centerIn: parent
                source: mainWindow.height == currentScreenHeight && mainWindow.width == currentScreenWidth / 2 ?
                            "icons/vertical-half.svg"
                            : mainWindow.width == currentScreenWidth ?
                                "icons/horizontal-half.svg"
                                : mainWindow.width == currentScreenWidth / 3 ?
                                    "icons/three-in-row.svg"
                                    : mainWindow.width == currentScreenWidth / 3 * 2 ?
                                        "icons/65-35.svg"
                                        : "icons/quarter.svg"
                sourceSize.width: parent.width - 8
                sourceSize.height: parent.height - 8
                cache: true
                opacity: 0.85
            }

            ToolTip.text: qsTr("Change layout (Tab)")
            onClicked: AssistManager.switchAssistLayout();
        }
    }

    /// Snapped windows previews
    Repeater {
        id: windowPreviewsRepeater
        enabled: immersiveMode
        model: visibleWindowPreviews

        KWinComponents.WindowThumbnail {
            wId: modelData.internalId
            clip: true
            visible: !modelData.minimized
            width: modelData.width
            height: modelData.height
            x: modelData.x - minDx
            y: modelData.y - minDy

            Behavior on x { PropertyAnimation {duration: transitionDuration; easing.type: Easing.OutExpo } }
            Behavior on y { PropertyAnimation {duration: transitionDuration; easing.type: Easing.OutExpo} }
            Behavior on width { PropertyAnimation {duration: transitionDuration; easing.type: Easing.OutExpo} }
            Behavior on height { PropertyAnimation {duration: transitionDuration; easing.type: Easing.OutExpo} }
        }
    }

    /// Current window preview
    Loader {
        id: currentWindowPreview
        active: immersiveMode && currentWindowId != null
        sourceComponent: Item {
            width: 1
            height: 1
            x: 0
            y: 0

            KWinComponents.WindowThumbnail {
                wId: currentWindowId
                anchors.fill: parent
            }
        }
    }

    /// Show notification windows on top
    Repeater {
        id: notificationsRepeater
        enabled: immersiveMode
        model: notificationPreviews

        KWinComponents.WindowThumbnail {
            wId: modelData.internalId
            clip: true
            visible: true
            width: modelData.width
            height: modelData.height
            x: modelData.x - minDx
            y: modelData.y - minDy
        }
    }

    /// One-shot timers. Each call gets its own Timer, so overlapping
    /// timeouts never fire each other's callbacks.
    Component {
        id: timeoutComponent
        Timer { repeat: false }
    }

    function setTimeout(callback, delay) {
        const t = timeoutComponent.createObject(main, { interval: Math.max(0, delay) });
        t.triggered.connect(t, function () {
            t.destroy();
            callback();
        });
        t.start();
        return t;
    }

    /// Debounces snap detection: a snap produces a burst of geometry changes,
    /// only the settled geometry is inspected.
    Timer {
        id: snapCheckTimer
        property var pendingWindow: null
        repeat: false
        onTriggered: {
            const window = pendingWindow;
            pendingWindow = null;
            WindowManager.onWindowResize(window);
        }
    }

    /// Keeps the assist suppressed while the script itself moves windows.
    /// Restarting extends the window instead of letting an older call end it early.
    Timer {
        id: preventTimer
        property var callbacks: []
        repeat: false
        onTriggered: {
            preventFromShowing = false;
            const pending = callbacks;
            callbacks = [];
            pending.forEach(cb => cb());
        }
    }

    /// Reference for current theme's highlight color
    SystemPalette {
        id: activePalette
        colorGroup: SystemPalette.Active
    }

    /// Keyboard handler
    Item {
        anchors.fill: parent
        id: keyboardHandler
        Keys.onPressed: function(event) {
            event.accepted = main.handleKey(event.key);
        }
    }

    /// --- public API: used by the views, the keyboard handler and the tests ---

    function handleKey(key) {
        if (!activated) return false;

        switch (key) {
        case Qt.Key_Escape:
            dismiss();
            return true;
        case Qt.Key_Left:
            KeyboardManager.moveFocusLeft();
            return true;
        case Qt.Key_Right:
            KeyboardManager.moveFocusRight();
            return true;
        case Qt.Key_Up:
            KeyboardManager.moveFocusUp();
            return true;
        case Qt.Key_Down:
            KeyboardManager.moveFocusDown();
            return true;
        case Qt.Key_Return:
        case Qt.Key_Enter:
            selectCandidate(focusedIndex);
            return true;
        case Qt.Key_Tab:
            AssistManager.switchAssistLayout();
            return true;
        }
        return false;
    }

    /// Place clients[index] into the zone the assist is covering.
    function selectCandidate(index) {
        if (!activated || selecting || !clients || index < 0 || index >= clients.length) return;
        WindowManager.animateWindowPreviewToSelect(index, clients[index]);
    }

    /// Close the assist without placing anything.
    function dismiss() {
        if (activated) AssistManager.hideAssist(true);
    }

    /// The window shown on the grid card at `index`.
    function cardWindow(index) {
        const card = clientsRepeater.itemAt(index);
        return card ? card.window : null; // qmllint disable missing-property
    }

    /// The screen area (global coordinates) the assist is offering to fill.
    function assistRect() {
        if (immersiveMode)
            return Qt.rect(mainWindow.x + minDx, mainWindow.y + minDy, mainWindow.width, mainWindow.height);
        return Qt.rect(main.x, main.y, main.width, main.height);
    }

    /// Enabled with the debugLogging setting; read with `journalctl --user -f | grep kdesnapassist6`
    function debugLog(...args) {
        /// warning level: distributions commonly filter out script info/debug output
        if (debugLogging) console.warn("kdesnapassist6:", ...args);
    }

    function readConfig(key, defaultValue) {
        if (configOverrides && configOverrides.hasOwnProperty(key)) return configOverrides[key];
        return KWin.readConfig(key, defaultValue);
    }

    function loadConfigs() {
        sortByLastActive = readConfig("sortByLastActive", true);
        descendingOrder = readConfig("descendingOrder", true);
        showMinimizedWindows = readConfig("showMinimizedWindows", true);
        showOtherScreensWindows = readConfig("showOtherScreensWindows", false);
        showOtherDesktopsWindows = readConfig("showOtherDesktopsWindows", false);
        textColor = readColorConfig("textColor", "#ffffff");
        cardColor = readColorConfig("cardColor", "#75475057");
        hoveredCardColor = readColorConfig("hoveredCardColor", "#75d9dde1");
        backdropColor = readColorConfig("backdropColor", "#902a2e32");
        borderRadius = readConfig("borderRadius", 5);
        transitionDuration = readConfig("transitionDuration", 300);
        snapDetectPrecision = readConfig("snapDetectPrecision", 0);
        delayBeforeShowingAssist = readConfig("delayBeforeShowingAssist", 100);
        rememberWindowSizes = readConfig("rememberWindowSizes", true);
        showSnappedWindows = readConfig("showSnappedWindows", true);
        minimizeSnappedTogether = readConfig("minimizeSnappedTogether", false);
        raiseSnappedTogether = readConfig("raiseSnappedTogether", false);
        fillOnSnappedClose = readConfig("fillOnSnappedClose", false);
        fillOnSnappedMove = readConfig("fillOnSnappedMove", false);
        fitWindowInGroupBehind = readConfig("fitWindowInGroupBehind", false);
        showDesktopBackground = readConfig("showDesktopBackground", true);
        desktopBackgroundBlur = readConfig("desktopBackgroundBlur", 18);
        immersiveMode = readConfig("immersiveMode", true);
        opacityForMinimized = readConfig("opacityForMinimized", 1.0);
        debugLogging = readConfig("debugLogging", false);
        trackSnappedWindows = minimizeSnappedTogether || raiseSnappedTogether || fillOnSnappedClose || fillOnSnappedMove || fitWindowInGroupBehind || !showSnappedWindows;
        trackActiveWindows = sortByLastActive || fitWindowInGroupBehind;
        if (!showDesktopBackground) immersiveMode = false;
    }

    /// The config dialog has been seen storing a boolean for colour keys; fall back to the default then.
    function readColorConfig(key, defaultValue) {
        const value = readConfig(key, defaultValue);
        return typeof value === "string" && value !== "" ? value : defaultValue;
    }
}
