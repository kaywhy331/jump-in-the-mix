import importlib.util
import json
import os
from pathlib import Path
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("uptime", Path(__file__).parents[1] / "infra/operations/uptime.py")
uptime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uptime)


class Responses(BaseHTTPRequestHandler):
    visits = []

    def do_GET(self):
        self.visits.append(self.path)
        code = 302 if self.path == "/redirect" else 503 if self.path == "/unavailable" else 200
        self.send_response(code)
        if code == 302:
            self.send_header("Location", "/must-not-follow")
        self.end_headers()
        self.wfile.write(b"status-only test response")

    def log_message(self, *args):
        pass


class UptimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Responses)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_http_success_and_unavailable_are_distinct(self):
        self.assertEqual(uptime.check(self.origin, "/healthy")["status"], 200)
        self.assertEqual(uptime.check(self.origin, "/unavailable")["status"], 503)

    def test_redirect_does_not_report_the_destination_as_healthy(self):
        self.assertEqual(uptime.check(self.origin, "/redirect")["status"], 302)
        self.assertNotIn("/must-not-follow", Responses.visits)

    def test_network_error_is_unhealthy(self):
        with patch.object(uptime.urllib.request, "build_opener", side_effect=TimeoutError()):
            self.assertEqual(uptime.check(self.origin, "/timeout")["status"], 0)

    def test_all_endpoints_must_be_healthy(self):
        with patch.dict(os.environ, {"APP_ORIGIN": "https://example.test"}), patch.object(uptime, "check", side_effect=lambda origin, path: {"path": path, "status": 200}) as check:
            self.assertEqual(uptime.handler({}, None), {"status": "healthy"})
            self.assertEqual(check.call_count, 4)
        with patch.dict(os.environ, {"APP_ORIGIN": "https://example.test"}), patch.object(uptime, "check", side_effect=lambda origin, path: {"path": path, "status": 503 if path.endswith("monitor") else 200}):
            with self.assertRaises(RuntimeError):
                uptime.handler({}, None)

    def test_qualification_failure_does_not_stop_or_call_the_product(self):
        with patch.dict(os.environ, {"APP_ORIGIN": "https://example.test"}), patch.object(uptime, "check") as check:
            with self.assertRaisesRegex(RuntimeError, "qualification"):
                uptime.handler({"qualification": "simulate-unavailable"}, None)
            check.assert_not_called()

    def test_unsafe_origin_is_rejected(self):
        for origin in ["http://example.test", "https://user:password@example.test", "https://example.test/private", "https://example.test?key=secret"]:
            with patch.dict(os.environ, {"APP_ORIGIN": origin}):
                with self.assertRaisesRegex(RuntimeError, "configuration"):
                    uptime.handler({}, None)


if __name__ == "__main__":
    unittest.main()
