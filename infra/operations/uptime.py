"""External health checks; CloudWatch owns outage/recovery notification state."""
import concurrent.futures
import json
import os
import urllib.error
import urllib.parse
import urllib.request

PATHS = ("/api/health/live", "/api/health/ready", "/api/health/worker", "/api/health/monitor")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(origin, path):
    try:
        opener = urllib.request.build_opener(NoRedirect)
        request = urllib.request.Request(origin + path, headers={"User-Agent": "JumpInTheMix-Availability/1", "Cache-Control": "no-cache"})
        with opener.open(request, timeout=5) as response:
            return {"path": path, "status": response.status}
    except urllib.error.HTTPError as error:
        error.close()
        return {"path": path, "status": error.code}
    except Exception:
        return {"path": path, "status": 0}


def handler(event, context):
    origin = os.environ["APP_ORIGIN"].rstrip("/")
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise RuntimeError("Invalid availability origin configuration")
    # This is reachable only by authenticated AWS invocation. It exercises the
    # actual error/alarm/recovery path without stopping the customer application.
    if event.get("qualification") == "simulate-unavailable":
        print(json.dumps({"qualification": "simulated-unavailable"}))
        raise RuntimeError("Monitoring qualification: simulated unavailability")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda path: check(origin, path), PATHS))
    print(json.dumps({"checks": results}))
    if any(result["status"] != 200 for result in results):
        raise RuntimeError("Jump in the Mix health check failed; inspect status-only check results")
    return {"status": "healthy"}
