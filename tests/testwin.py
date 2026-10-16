"""Minimal GTK4 toplevel used as a test window: python3 testwin.py <title>"""
import sys

import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gtk  # noqa: E402

TITLE = sys.argv[1] if len(sys.argv) > 1 else "testwin"


def on_activate(app):
    window = Gtk.ApplicationWindow(application=app, title=TITLE)
    window.set_default_size(640, 480)
    window.set_child(Gtk.Label(label=TITLE))
    window.present()


app = Gtk.Application()
app.connect("activate", on_activate)
app.run([])
