"""Tests de l'outil ffclavicule. Lancer : python3 -m unittest discover -s tests"""

import importlib.machinery
import importlib.util
import io
import json
import os
import socketserver
import tempfile
import threading
import tomllib
import unittest
from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent

_loader = importlib.machinery.SourceFileLoader("ffclavicule", str(ROOT / "ffclavicule"))
_spec = importlib.util.spec_from_loader("ffclavicule", _loader)
ffc = importlib.util.module_from_spec(_spec)
_loader.exec_module(ffc)

# Extrait représentatif d'une config générée par Wolf (chaînes multilignes, tableaux de tables imbriqués).
WOLF_CONFIG = '''
hostname = "Wolf"
config_version = 7
uuid = "0f75f4d1-e28e-410a-b318-c0579f18f8d1"

[[paired_clients]]
client_cert = """-----BEGIN CERTIFICATE-----
MIIB
-----END CERTIFICATE-----
"""
app_state_folder = "12345"

[paired_clients.settings]
run_uid = 1000
run_gid = 1000
controllers_override = []
mouse_acceleration = 1.0

[[profiles]]
id = "moonlight-profile-id"

[[profiles.apps]]
title = "Test ball"
start_virtual_compositor = false

[profiles.apps.runner]
type = "process"
run_cmd = "sh -c \\"while :; do echo 'running...'; sleep 10; done\\""

[profiles.apps.video]
source = """
videotestsrc pattern=ball flip=true is-live=true !
video/x-raw, framerate={fps}/1
\\
"""

[[profiles]]
id = "user"
name = "User"
apps = []

[gstreamer.audio]
default_source = "interpipesrc name=interpipesrc_{}_audio listen-to={session_id}_audio is-live=true"

[[gstreamer.video.h264_encoders]]
plugin_name = "va"
check_elements = ["vah264enc", "vapostproc"]
encoder_pipeline = """vah264enc aud=false b-frames=0 !
h264parse !
video/x-h264, profile=main, stream-format=byte-stream"""
'''

SETTINGS = dict(ffc.DEFAULTS, FFCLAVICULE_DATA="/data", FFCLAVICULE_NAME="maison")


class TomlTest(unittest.TestCase):
    def test_round_trip_keeps_everything(self):
        config = tomllib.loads(WOLF_CONFIG)
        self.assertEqual(tomllib.loads(ffc.toml_dumps(config)), config)

    def test_special_characters(self):
        data = {"a b": "guillemets \" et \\ et\nretour", "é": [1, 2.5, True], "t": {"x": {"y": "z"}}}
        self.assertEqual(tomllib.loads(ffc.toml_dumps(data)), data)


class ConfigureTest(unittest.TestCase):
    def setUp(self):
        self.config = tomllib.loads(WOLF_CONFIG)

    def apps(self, config):
        (profile,) = config["profiles"]
        self.assertEqual(profile["id"], ffc.MOONLIGHT_PROFILE_ID)
        return profile["apps"]

    def test_replaces_apps_and_keeps_the_rest(self):
        new = tomllib.loads(ffc.toml_dumps(ffc.configure(self.config, SETTINGS, maintenance=False)))
        self.assertEqual([a["title"] for a in self.apps(new)], [ffc.PLAY_TITLE])
        self.assertEqual(new["hostname"], "maison")
        for key in ("uuid", "paired_clients", "gstreamer", "config_version"):
            self.assertEqual(new[key], self.config[key])

    def test_players_get_read_only_game(self):
        (app,) = self.apps(ffc.configure(self.config, SETTINGS, maintenance=False))
        runner = app["runner"]
        self.assertEqual(runner["mounts"], ["/data/game:/ffxiv:ro"])
        self.assertIn("FFCLAVICULE_MODE=play", runner["env"])
        self.assertEqual(runner["image"], SETTINGS["FFXIV_IMAGE"])
        create = json.loads(runner["base_create_json"])
        self.assertFalse(create["HostConfig"]["Privileged"])

    def test_maintenance_app_writes_game(self):
        new = ffc.configure(self.config, SETTINGS, maintenance=True)
        play, maint = self.apps(new)
        self.assertEqual(maint["title"], ffc.MAINTENANCE_TITLE)
        self.assertEqual(maint["runner"]["mounts"], ["/data/game:/ffxiv:rw"])
        self.assertIn("FFCLAVICULE_MODE=maintenance", maint["runner"]["env"])
        self.assertNotEqual(play["runner"]["name"], maint["runner"]["name"])
        self.assertTrue(ffc.maintenance_enabled(new))
        self.assertFalse(ffc.maintenance_enabled(ffc.configure(new, SETTINGS, maintenance=False)))

    def test_settings_reach_the_session(self):
        settings = dict(SETTINGS, KEYBOARD_LAYOUT="be", FFXIV_LANGUAGE="German", XL_SECRET_PROVIDER="FILE")
        (app,) = self.apps(ffc.configure(self.config, settings, maintenance=False))
        env = app["runner"]["env"]
        for expected in ("XKB_DEFAULT_LAYOUT=be", "FFXIV_LANGUAGE=German", "XL_SECRET_PROVIDER=FILE"):
            self.assertIn(expected, env)


class SettingsTest(unittest.TestCase):
    def test_env_file_then_environment(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_file = Path(tmp) / ".env"
            env_file.write_text('# commentaire\nFFCLAVICULE_DATA="/mnt/jeux"\nKEYBOARD_LAYOUT=us\n')
            with mock.patch.dict(os.environ, {"KEYBOARD_LAYOUT": "ch"}):
                settings = ffc.load_settings(env_file)
        self.assertEqual(settings["FFCLAVICULE_DATA"], "/mnt/jeux")
        self.assertEqual(settings["KEYBOARD_LAYOUT"], "ch")
        self.assertEqual(settings["FFXIV_LANGUAGE"], "French")

    def test_player_names(self):
        self.assertEqual(ffc.check_player_name("anton_2"), "anton_2")
        for bad in ("", "Anton", "../root", "a b", "x" * 40):
            with self.assertRaises(ffc.CliError):
                ffc.check_player_name(bad)
        self.assertEqual(ffc.player_from_folder("players/anton"), "anton")
        self.assertIsNone(ffc.player_from_folder("1234567"))


class FakeWolf:
    """Imite l'API de Wolf sur un socket UNIX : appairage, appareils, réglages."""

    def __init__(self, path):
        self.pending = [{"pair_secret": "s3cr3t", "client_ip": "192.168.1.20"}]
        self.clients = [{"client_id": "111", "app_state_folder": "111", "settings": {}}]
        self.calls = []
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, status, data):
                body = json.dumps(data).encode()
                # Wolf répond en HTTP/1.0 avec "OK" quel que soit le code.
                self.wfile.write(f"HTTP/1.0 {status} OK\r\nContent-Length: {len(body)}\r\n\r\n".encode() + body)

            def do_GET(self):
                fake.calls.append(("GET", self.path, None))
                if self.path == "/api/v1/pair/pending":
                    self.reply(200, {"success": True, "requests": fake.pending})
                elif self.path == "/api/v1/clients":
                    self.reply(200, {"success": True, "clients": fake.clients})
                elif self.path == "/api/v1/sessions":
                    self.reply(200, {"success": True, "sessions": []})
                else:
                    self.reply(404, {})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                fake.calls.append(("POST", self.path, body))
                if self.path == "/api/v1/pair/client":
                    if body["pair_secret"] != "s3cr3t":
                        return self.reply(500, {"success": False, "error": "Invalid pair secret"})
                    fake.pending = []
                    fake.clients.append({"client_id": "222", "app_state_folder": "222", "settings": {}})
                    self.reply(200, {"success": True})
                elif self.path == "/api/v1/clients/settings":
                    for c in fake.clients:
                        if c["client_id"] == body["client_id"]:
                            c["app_state_folder"] = body["app_state_folder"]
                    self.reply(200, {"success": True})
                else:
                    self.reply(404, {})

        self.server = socketserver.ThreadingUnixStreamServer(path, Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()


class PairTest(unittest.TestCase):
    def run_cli(self, *argv):
        out = io.StringIO()
        with redirect_stdout(out), mock.patch.object(ffc.os, "geteuid", return_value=0):
            code = ffc.main(list(argv))
        return code, out.getvalue()

    def test_pair_assigns_player_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            sock = os.path.join(tmp, "wolf.sock")
            with FakeWolf(sock) as wolf, mock.patch.object(ffc, "WOLF_SOCKET", sock):
                code, out = self.run_cli("pair", "1234", "--player", "anton")
                self.assertEqual(code, 0, out)
                self.assertIn(("POST", "/api/v1/pair/client", {"pair_secret": "s3cr3t", "pin": "1234"}), wolf.calls)
                self.assertEqual(wolf.clients[1]["app_state_folder"], "players/anton")
                self.assertEqual(wolf.clients[0]["app_state_folder"], "111")

                code, out = self.run_cli("players")
                self.assertIn("anton", out)

    def test_pair_without_pending_device(self):
        with tempfile.TemporaryDirectory() as tmp:
            sock = os.path.join(tmp, "wolf.sock")
            with FakeWolf(sock) as wolf, mock.patch.object(ffc, "WOLF_SOCKET", sock):
                wolf.pending = []
                code, _ = self.run_cli("pair", "1234", "--player", "anton")
                self.assertEqual(code, 1)
                self.assertFalse(any(c[1] == "/api/v1/pair/client" for c in wolf.calls))

    def test_assign_unknown_device(self):
        with tempfile.TemporaryDirectory() as tmp:
            sock = os.path.join(tmp, "wolf.sock")
            with FakeWolf(sock), mock.patch.object(ffc, "WOLF_SOCKET", sock):
                code, _ = self.run_cli("assign", "999", "anton")
                self.assertEqual(code, 1)
                code, _ = self.run_cli("assign", "111", "anton")
                self.assertEqual(code, 0)

    def test_wolf_down(self):
        with mock.patch.object(ffc, "WOLF_SOCKET", "/nonexistent/wolf.sock"):
            code, _ = self.run_cli("players")
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
