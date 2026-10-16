# <sub><img src="./assets/logo.png" height="48" width="48"></sub> KDE Snap Assist 6
Plasma 6 port of [emvaized/kde-snap-assist](https://github.com/emvaized/kde-snap-assist) (which supports Plasma 5), building on
[luisbocanegra's WIP port](https://github.com/luisbocanegra/kde-snap-assist/tree/plasma6). Tested on KDE Plasma 6.7 / Fedora 44 (Wayland).
Installs as `kdesnapassist6`, so it does not clash with the original script. Plasma 5 users: see the [original on the KDE Store](https://store.kde.org/p/1875687).

This KWin script for KDE Plasma suggests other window thumbnails on snap. It tries to replicate the famous Windows 10/11 feature of the same name.

Assist can be shown by dragging a window to the screen edge, as well as via default keyboard shortcuts (`super`+arrows).
You can select the window with mouse, as well as with arrow keys + `Enter`. 
To dismiss the assist, hit `Escape` key, press the close button or click anywhere on the empty area. 
Script also supports quarter and triple tiling: you can switch layouts with the `Tab` key or using the button in corner.

Ideas, suggestions, bugs reports and contributions to the project are welcome!

![screenshot_snapassist](./assets/screenshot.png)

---
### What's new in this fork
Compared with the original Plasma 5 script (and the unfinished Plasma 6 work it builds on):

**Works on Plasma 6**
- Ported to the KWin 6 scripting API, Qt 6 and KDE Frameworks 6; tested on KWin 6.7.5 (Fedora 44, Wayland)
- Fixed KWin crashing when the script was reloaded or its settings were saved
- Fixed the settings dialog on KF6 (number fields could not be edited)
- Desktop background blur uses Qt 6 `MultiEffect`, so the Qt5Compat module is not needed
- Keyboard control of the assist works on Wayland (arrows, `Enter`, `Escape`, `Tab`): KWin 6 only sends keys to
  a script's window when it is a tool window, so the assist now is one

**Works with how KWin 6 tiles windows**
- Snaps are recognised at any split, not only exact halves and quarters: if you dragged the divider between
  snapped windows (KWin 6 remembers it), the assist fills whatever space is left
- Windows you pick from the assist join KWin's tile layout, so dragging the edge between snapped windows
  resizes all of them together, side by side or in a 2×2 grid
- The assist only offers empty space: moving the split between windows that are already snapped, or snapping
  into the last free quarter, no longer brings up the assist; a quarter snap skips quarters that are taken
- A window pushed flush to a screen edge by hand is not mistaken for a snap
- Snap detection tolerates KWin 6's fractional window positions

**Fixes**
- No more full-screen "zoom out" ghost (KWin's close animation) when the assist closes
- The assist no longer offers its own overlay window, and no longer shows duplicate or mismatched cards
- Windows on all desktops are offered again, and "Show windows from other desktops" works again
- Minimize-together and restore-size-on-unsnap fixed for KWin 6
- Dismissing repeatedly during the closing animation no longer misbehaves

**For developers and troubleshooting**
- An automated test suite runs the real script in a headless, sandboxed KWin, typing real keys through KWin's
  input stack, plus `qmllint` and config checks
  (see [Development](#development))
- A `Makefile` for install, live reload, packaging and tests
- An optional debug log that explains why the assist did or did not appear (see [Troubleshooting](#troubleshooting))

Installs as `kdesnapassist6` next to the original, so the two do not clash; settings from the original script
are not carried over. Full history in the [CHANGELOG](./CHANGELOG).

---
### Snap Groups

Since version `1.4`, there are also experimental *snap group* features:
- Minimize/restore snapped windows together ([demo](./assets/demos/snap%20groups/minimize-together.gif))
- Raise snapped windows together ([demo](./assets/demos/snap%20groups/raise-together.gif))
- On close snapped window, try to fill the area ([demo](./assets/demos/snap%20groups/fill-on-close.gif))
- Try to fit snapped window in group behind ([demo](./assets/demos/snap%20groups/fit-in-group-behind.gif))

When you enable any of these options in the script settings, it will start tracking windows snapped via the script. Group of snapped windows is remembered once you fill the layout using the assist. Window is no longer considered snapped once it was closed or moved manually using the mouse (sometimes you need to do it twice to break it from the group). Snap groups are not persistent, and should be recreated after each reboot.

---
### Manual Installation (Plasma 6)
From a clone of this repository:
```sh
make install   # installs/upgrades the script for your user (kpackagetool6)
make enable    # enables it in KWin (same as ticking it in System Settings > Window Management > KWin Scripts)
```
`make reload` re-installs the script and runs the new code right away (KWin caches a script's code until you log out, so re-enabling it is not enough); `make uninstall` removes it.
`make package` builds an installable `dist/*.kwinscript` for "Install from File...".

---
### Development
Requirements on Fedora: `kwin`, `python3-gobject` + `gtk4` (test windows), `zip`, and
`qt6-qtdeclarative-devel` for `qmllint`.

```sh
make check   # lint + end-to-end tests + packaging smoke test
```
- `tests/run-tests.sh` starts a **headless, sandboxed** `kwin_wayland --virtual` on its own D-Bus
  session with throwaway XDG directories, so it never touches your running Plasma session or
  `~/.config`. It loads the real script, opens GTK test windows, snaps them with KWin's own
  quick-tile actions and checks the result. Output is TAP.
  Use `--filter REGEX` to run some tests, `--verbose` for the KWin log, and
  `--screenshot DIR` to save screenshots of the assist.
- `tests/kwin/UnitTests.js` covers the pure geometry in `contents/ui/code/layout.js`;
  `tests/kwin/IntegrationTests.js` covers end-to-end behaviour.
- `tests/lint.sh` runs `qmllint` (see `.qmllint.ini`) and checks that every setting has the same
  default in `contents/config/main.xml` and `main.qml`, and a widget in `config.ui`.

The tests cannot produce real mouse drags or key presses, so check those by hand in a real
session after changing input handling: dragging windows and splits, and keyboard and mouse use of the overlay.

---
### Troubleshooting
- KWin restarts the script when you save its settings. KWin keeps running the code it first loaded until you log out, so after updating the script, log out and back in (or run `make reload` from a checkout). The same is recommended if you switch from one version of the script to another
- Assist will not show if you have no other windows matching the conditions set in the script settings. For example, by default the script does not show windows from other screens — so, if you have only one window on the current screen, assist will not show
- To see why the assist did or did not show, turn on the debug log and watch the system log while you snap a window:
  ```sh
  kwriteconfig6 --file kwinrc --group Script-kdesnapassist6 --key debugLogging true   # or tick it in the script settings
  journalctl --user -f | grep kdesnapassist6
  ```
  Each snap logs the window geometry, whether it counted as a snap, and why the assist was skipped. Turn it off again with `--key debugLogging false`
- Script settings button is not visible, or complains that "Plugin doesn't provide configuration file in the expected location" — this is a known KWin's bug, not related to the script. Make sure your system is up-to-date, as it seems to be fixed now. If it doesn't help, you can also try to install the script [manually](#manual-installation-plasma-6)
- KWin crashes after sleep — it was reported [here](https://github.com/emvaized/kde-snap-assist/issues/35) that you may need to install `pygdbmi` library to fix the crash after sleep

---
### Compatibility notes

#### Compatibility with [Window Gap](https://github.com/nclarius/tile-gaps)

- Since version 1.2, there's an option "Snap detect tolerance" in the script settings, which basically defines how much window's size and position can differ to still be detected as "snapped" by the script. If you use some external scripts which constantly modify windows size and position, you may want to set it to `15px` or `25px`, so that Snap Assist could detect your snaps.

#### Compatibility with [Exquisite](https://www.pling.com/p/1852610)

- Most of default layouts are supported out the box. You may also like to enable "Hide after tiling a window" in Exquisite's settings for the smoothest workflow. Over time, support for custom layouts will expand, possibly with ability to edit them.

#### Compatibility with [Sticky Window Snapping](https://www.pling.com/p/1112552)

- Fully compatible. Highly recommended to be used in conjunction with Snap Assist!

#### Compatibility with diagonal keyboard shortcuts

- Version 1.4 introduces an option "Delay before showing the assist", which gives some time to execute 'diagonal' shortcuts (`super` + `↑` + `→`) before Assist gets shown. The default value is `100ms`.

--- 

### Donate
This script was created by [emvaized](https://github.com/emvaized). If you **really** like it, you can thank them by buying them a coffee :)

<a href="https://www.paypal.com/donate/?business=2KDNGXNUVZW7N&no_recurring=0&currency_code=USD"><img src="https://www.paypalobjects.com/en_US/DK/i/btn/btn_donateCC_LG.gif" height="25"/></a>
