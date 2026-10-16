#!/usr/bin/python3 -I
"""Types real key presses into the KWin on this D-Bus session, through KWin's
EIS (libei) remote-desktop interface, the way remote desktop input arrives.
Unlike calling the script's key handler, this exercises KWin's own keyboard
routing, so it catches keys going to the wrong window.

usage: eiskeys.py KEY [KEY ...]     e.g.  eiskeys.py Meta+Left Right Return
Only meant for the sandboxed test session (tests/session.sh).
"""
import ctypes
import select
import sys
import time

from gi.repository import Gio, GLib

KEYCODES = {  # linux/input-event-codes.h
    "Escape": 1, "Tab": 15, "Return": 28, "Enter": 28, "Left": 105, "Right": 106,
    "Up": 103, "Down": 108, "Meta": 125, "Shift": 42, "Ctrl": 29, "Alt": 56, "A": 30,
}

# libei.h
EI_EVENT_CONNECT, EI_EVENT_DISCONNECT, EI_EVENT_SEAT_ADDED = 1, 2, 3
EI_EVENT_DEVICE_ADDED, EI_EVENT_DEVICE_RESUMED = 5, 8
EI_DEVICE_CAP_KEYBOARD = 1 << 2
KWIN_CAP_KEYBOARD = 0xff  # org.kde.KWin.EIS.RemoteDesktop capabilities: ask for everything

ei = ctypes.CDLL("libei.so.1")
P = ctypes.c_void_p
for name, res, args in [
    ("ei_new_sender", P, [P]),
    ("ei_configure_name", None, [P, ctypes.c_char_p]),
    ("ei_setup_backend_fd", ctypes.c_int, [P, ctypes.c_int]),
    ("ei_get_fd", ctypes.c_int, [P]),
    ("ei_dispatch", None, [P]),
    ("ei_get_event", P, [P]),
    ("ei_event_get_type", ctypes.c_int, [P]),
    ("ei_event_get_seat", P, [P]),
    ("ei_event_get_device", P, [P]),
    ("ei_event_unref", P, [P]),
    ("ei_device_has_capability", ctypes.c_bool, [P, ctypes.c_int]),
    ("ei_device_ref", P, [P]),
    ("ei_device_start_emulating", None, [P, ctypes.c_uint32]),
    ("ei_device_stop_emulating", None, [P]),
    ("ei_device_keyboard_key", None, [P, ctypes.c_uint32, ctypes.c_bool]),
    ("ei_device_frame", None, [P, ctypes.c_uint64]),
    ("ei_now", ctypes.c_uint64, [P]),
    ("ei_unref", P, [P]),
]:
    fn = getattr(ei, name)
    fn.restype, fn.argtypes = res, args
ei.ei_seat_bind_capabilities.restype = None  # variadic, NULL-terminated


# KWin ends the EIS session when the caller leaves the bus, and GIO closes the
# shared connection once nothing references it, so hold on to it until exit.
BUS = None


def connect_fd():
    global BUS
    BUS = Gio.bus_get_sync(Gio.BusType.SESSION)
    result, fds = BUS.call_with_unix_fd_list_sync(
        "org.kde.KWin", "/org/kde/KWin/EIS/RemoteDesktop", "org.kde.KWin.EIS.RemoteDesktop",
        "connectToEIS", GLib.Variant("(i)", (KWIN_CAP_KEYBOARD,)), GLib.VariantType("(hi)"),
        Gio.DBusCallFlags.NONE, 5000, None, None)
    return fds.get(result.unpack()[0])


def keyboard(ctx, timeout=5.0):
    """Dispatches libei events until KWin hands us a resumed keyboard device."""
    device, deadline = None, time.monotonic() + timeout
    while time.monotonic() < deadline:
        select.select([ei.ei_get_fd(ctx)], [], [], 0.1)
        ei.ei_dispatch(ctx)
        while (ev := ei.ei_get_event(ctx)):
            kind = ei.ei_event_get_type(ev)
            if kind == EI_EVENT_SEAT_ADDED:
                ei.ei_seat_bind_capabilities(P(ei.ei_event_get_seat(ev)), ctypes.c_int(EI_DEVICE_CAP_KEYBOARD), P(None))
            elif kind == EI_EVENT_DEVICE_ADDED:
                dev = ei.ei_event_get_device(ev)
                if ei.ei_device_has_capability(dev, EI_DEVICE_CAP_KEYBOARD):
                    device = ei.ei_device_ref(dev)
            elif kind == EI_EVENT_DEVICE_RESUMED and device:
                ei.ei_event_unref(ev)
                return device
            elif kind == EI_EVENT_DISCONNECT:
                sys.exit("eiskeys: KWin closed the EIS connection")
            ei.ei_event_unref(ev)
    sys.exit("eiskeys: no keyboard device from KWin")


def key(ctx, dev, code, pressed):
    ei.ei_device_keyboard_key(dev, code, pressed)
    ei.ei_device_frame(dev, ei.ei_now(ctx))
    ei.ei_dispatch(ctx)
    time.sleep(0.03)


def main(chords):
    ctx = ei.ei_new_sender(None)
    ei.ei_configure_name(ctx, b"kde-snap-assist tests")
    if ei.ei_setup_backend_fd(ctx, connect_fd()) != 0:
        sys.exit("eiskeys: cannot set up libei")
    dev = keyboard(ctx)
    ei.ei_device_start_emulating(dev, 1)
    for chord in chords:
        codes = [KEYCODES[k] for k in chord.split("+")]
        for c in codes:
            key(ctx, dev, c, True)
        for c in reversed(codes):
            key(ctx, dev, c, False)
        time.sleep(0.15)
    ei.ei_device_stop_emulating(dev)
    ei.ei_dispatch(ctx)
    time.sleep(0.1)
    ei.ei_unref(ctx)


if __name__ == "__main__":
    main(sys.argv[1:])
