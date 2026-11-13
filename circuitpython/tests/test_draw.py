"""Runs circuitpython/draw.py on a normal computer with pretend hardware.

Checks the settings, the request, the cleanup and the error counter. It does NOT prove anything about
the real board, the real display or real Wi-Fi; that still needs the hardware.
Run:  python3 -m unittest circuitpython/tests/test_draw.py
"""
import os
import runpy
import sys
import types
import unittest

DRAW = os.path.join(os.path.dirname(__file__), "..", "draw.py")


class StopLoop(BaseException):  # not an Exception, so draw.py cannot swallow it
    pass


def run_draw(script, env=None, read_ok=True):
    """script: list of what each requests.get does: 'exc' (network error), or an HTTP status number."""
    env = env or {}
    log = {"urls": [], "headers": [], "closed": 0, "refresh": 0, "resets": 0, "reads": 0}
    script = list(script)

    class Resp:
        def __init__(self, code):
            self.status_code = code

        def iter_content(self, chunk_size=1024):
            return iter([b""])

        def close(self):
            log["closed"] += 1

    class Session:
        def __init__(self, *a, **k):
            pass

        def get(self, url, headers=None):
            if not script:
                raise StopLoop()
            step = script.pop(0)
            log["urls"].append(url)
            log["headers"].append(headers)
            if step == "exc":
                raise OSError("network down")
            return Resp(step)

    def mod(name, **attrs):
        m = types.ModuleType(name)
        m.__dict__.update(attrs)
        return m

    class Display:
        root_group = None

        def refresh(self):
            log["refresh"] += 1

    def read_bmp(content, bitmap, palette):
        log["reads"] += 1
        if not read_ok:
            raise ValueError("bad picture")
        return True

    def reset():
        log["resets"] += 1
        raise StopLoop()

    fakes = {
        "displayio": mod("displayio", release_displays=lambda: None,
                         Bitmap=lambda *a: object(), Palette=lambda *a: object(),
                         Group=lambda: types.SimpleNamespace(append=lambda x: None),
                         TileGrid=lambda *a, **k: object()),
        "waveshare7in5bv3": mod("waveshare7in5bv3", Waveshare7in5Bv3=Display),
        "adafruit_connection_manager": mod("adafruit_connection_manager",
                                           get_radio_socketpool=lambda r: object(),
                                           get_radio_ssl_context=lambda r: object()),
        "wifi": mod("wifi", radio=object()),
        "adafruit_requests": mod("adafruit_requests", Session=Session),
        "bmpread": mod("bmpread", read_bmp=read_bmp),
        "microcontroller": mod("microcontroller", reset=reset),
    }
    real_getenv, real_sleep = os.getenv, __import__("time").sleep
    saved = {k: sys.modules.get(k) for k in fakes}
    sys.modules.update(fakes)
    os.getenv = lambda k, d=None: env.get(k, d)
    __import__("time").sleep = lambda s: None
    try:
        runpy.run_path(DRAW)
    except StopLoop:
        pass
    finally:
        os.getenv, __import__("time").sleep = real_getenv, real_sleep
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
    return log


class DrawTests(unittest.TestCase):
    def test_uses_host_from_settings_and_fixed_path(self):
        log = run_draw([200], env={"FRAME_HOST": "abc.def.workers.dev"})
        self.assertEqual(log["urls"], ["https://abc.def.workers.dev/drawing.bmp"])
        self.assertEqual(log["refresh"], 1)

    def test_falls_back_to_placeholder_host(self):
        log = run_draw([200])
        self.assertEqual(log["urls"], ["https://your-domain.com/drawing.bmp"])

    def test_sends_device_name_and_no_key_by_default(self):
        log = run_draw([200])
        self.assertEqual(log["headers"][0], {"User-Agent": "InkLinkFrame/1.0"})

    def test_sends_key_when_set(self):
        log = run_draw([200], env={"FRAME_KEY": "view-key-456"})
        self.assertEqual(log["headers"][0]["x-frame-key"], "view-key-456")
        self.assertEqual(log["headers"][0]["User-Agent"], "InkLinkFrame/1.0")

    def test_no_picture_response_is_closed_and_not_read(self):
        log = run_draw([404])
        self.assertEqual(log["closed"], 1)
        self.assertEqual(log["reads"], 0)
        self.assertEqual(log["refresh"], 0)

    def test_good_picture_response_is_closed(self):
        log = run_draw([200])
        self.assertEqual(log["closed"], 1)

    def test_errors_reset_after_a_good_fetch(self):
        # 15 failures, one good picture, 15 more failures: 30 in total, but never 21 in a row
        log = run_draw(["exc"] * 15 + [200] + ["exc"] * 15)
        self.assertEqual(log["resets"], 0)

    def test_restarts_after_too_many_errors_in_a_row(self):
        log = run_draw(["exc"] * 25)
        self.assertEqual(log["resets"], 1)

    def test_bad_picture_counts_as_error(self):
        log = run_draw([200] * 25, read_ok=False)
        self.assertEqual(log["resets"], 1)


if __name__ == "__main__":
    unittest.main()
