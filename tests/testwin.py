"""Minimal GTK4 toplevel used as a test window: python3 testwin.py <title>
Every key it receives is appended to $KSA_KEYLOG as "<title> <key name>", so
tests can tell when a key went to a window instead of the assist."""
import os
import sys

import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gdk, Gtk  # noqa: E402

TITLE = sys.argv[1] if len(sys.argv) > 1 else "testwin"


def on_key(_controller, keyval, _keycode, _state):
    log = os.environ.get("KSA_KEYLOG")
    if log:
        with open(log, "a") as f:
            f.write(f"{TITLE} {Gdk.keyval_name(keyval)}\n")
    return False


def on_activate(app):
    window = Gtk.ApplicationWindow(application=app, title=TITLE)
    window.set_default_size(640, 480)
    window.set_child(Gtk.Label(label=TITLE))
    keys = Gtk.EventControllerKey()
    keys.connect("key-pressed", on_key)
    window.add_controller(keys)
    window.present()


app = Gtk.Application()
app.connect("activate", on_activate)
app.run([])
