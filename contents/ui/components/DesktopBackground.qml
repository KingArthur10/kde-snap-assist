import QtQuick
import QtQuick.Effects
import QtQuick.Window
import org.kde.kwin as KWinComponents

Item {
    y: - ((immersiveMode ? mainWindow.y : main.y) - minDy)
    x: - ((immersiveMode ? mainWindow.x : main.x) - minDx)
    height: Screen.height
    width: currentScreenWidth
    visible: showDesktopBackground && activated

    KWinComponents.WindowThumbnail {
        id: desktopBackground
        wId: desktopWindowId
        anchors.fill: parent
        visible: desktopBackgroundBlur <= 0
    }

    /// configurable blur
    MultiEffect {
        anchors.fill: parent
        source: desktopBackground // qmllint disable incompatible-type
        visible: desktopBackgroundBlur > 0
        blurEnabled: true
        blurMax: 64
        blur: Math.min(desktopBackgroundBlur / 64, 1.0)
        autoPaddingEnabled: false
    }
}
