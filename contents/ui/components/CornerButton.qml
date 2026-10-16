import QtQuick
import QtQuick.Controls
import org.kde.plasma.components as PlasmaComponents

PlasmaComponents.Button {
        id: button
        x: mainWindow.width - 50
        height: 30
        width: 30
        visible: true
        flat: false
        focusPolicy: Qt.NoFocus
        icon.height: 30
        icon.width: 30

        ToolTip.delay: 1000
        ToolTip.visible: hovered

        background: Rectangle {
            color: "#31363B"
            radius: 3
            border.width: 1
            border.color: button.hovered ? activePalette.highlight : "gray"
        }
}
