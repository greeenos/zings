# Checks the integration hooks (REST API, webhooks, inbound email, calendars, AI key).
# Run against a throwaway instance in host networking on :8094:
#   docker run -d --network host -v $PWD/pb_hooks:/pb/pb_hooks:ro -v $PWD/pb_migrations:/pb/pb_migrations:ro zings:dev \
#     /pb/pocketbase serve --http=127.0.0.1:8094 --dir=/pb/pb_data --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations
# Integration hooks against a throwaway instance (API on :8094, helper server on :8099).
import json, sys, threading, urllib.request, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

API = "http://127.0.0.1:8094"
HOST = "http://127.0.0.1:8099"  # the test instance runs in host networking
hooks = []
ICS = "\r\n".join([
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x", "SUMMARY:Dentist", "DTSTART:20261026T090000", "DTEND:20261026T093000", "END:VEVENT", "END:VCALENDAR",
])

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.send_header("content-type", "text/calendar"); self.end_headers(); self.wfile.write(ICS.encode())
    def do_POST(self):
        hooks.append(json.loads(self.rfile.read(int(self.headers["content-length"]))))
        self.send_response(200); self.end_headers()
    def log_message(self, *a): pass

srv = HTTPServer(("0.0.0.0", 8099), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

def req(method, path, token=None, body=None, form=False):
    data = None
    if body is not None:
        data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
    r = urllib.request.Request(API + path, method=method, data=data)
    r.add_header("content-type", "application/x-www-form-urlencoded" if form else "application/json")
    if token: r.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(r) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

ok = True
def check(label, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + label + (f"  {extra}" if not cond else ""))
    ok &= bool(cond)

req("POST", "/api/collections/users/records", body={"email": "i@t.test", "password": "testtest123", "passwordConfirm": "testtest123"})
_, d = req("POST", "/api/collections/users/auth-with-password", body={"identity": "i@t.test", "password": "testtest123"})
tok, me = d["token"], d["record"]
check("user has apiToken and mailToken", len(me.get("apiToken", "")) == 32 and len(me.get("mailToken", "")) == 24)

s, d = req("PATCH", f"/api/collections/users/records/{me['id']}", tok, {
    "webhookUrl": HOST + "/hook", "calendars": [{"url": HOST + "/cal.ics", "name": "Home"}],
})
check("settings saved", s == 200, d)
s, d = req("POST", "/api/ai/key", tok, {"key": "sk-ant-secret-abcd"})
check("AI key stored, only the hint comes back", s == 200 and d.get("aiKeyHint") == "…abcd" and d.get("aiProvider") == "anthropic", d)
s, d = req("POST", "/api/ai/breakdown", tok, {"title": "Plan a trip"})
check("a bad key surfaces as a readable error", s == 502 and "rejected" in d.get("message", ""), d)
s, d = req("POST", "/api/ai/key", tok, {"key": "sk-or-v1-bogus-efgh", "provider": "openrouter", "model": "openrouter/auto"})
check("OpenRouter key stored with its model", s == 200 and d == {"aiKeyHint": "…efgh", "aiProvider": "openrouter", "aiModel": "openrouter/auto"}, d)
s, d = req("POST", "/api/ai/capture", tok, {"text": "buy milk"})
check("a bad OpenRouter key surfaces as a readable error", s == 502 and "OpenRouter" in d.get("message", ""), d)
_, d = req("GET", f"/api/collections/users/records/{me['id']}", tok)
check("the key never comes back from the API", "aiKey" not in d and d.get("aiKeyHint", "").startswith("…"), d)

bearer = "Bearer " + me["apiToken"]
req("POST", "/api/v1/todos", bearer, {"title": "Dentist checkup tomorrow"})
s, d = req("POST", "/api/v1/todos", bearer, {"title": "Call mom tomorrow at 5pm !!"})
check("API creates a parsed to-do", s == 201 and d["title"] == "Call mom" and d["dueTime"] == "17:00" and d["priority"] == 2, d)
tid = d.get("id")
s, d = req("GET", "/api/v1/todos", bearer)
check("API lists it", s == 200 and tid in [t["id"] for t in d["items"]], d)
s, _ = req("GET", "/api/v1/todos", "Bearer " + "x" * 32)
check("bad token is 401", s == 401)
s, d = req("POST", f"/api/v1/todos/{tid}/complete", bearer)
check("API completes it", s == 200 and d["completed"] is True, d)
check("webhooks fired for created + completed", [h["event"] for h in hooks] == ["todo.created", "todo.created", "todo.completed"], hooks)

s, d = req("POST", f"/api/inbound/email/{me['mailToken']}", body={"subject": "Pay invoice by friday", "text": "Invoice attached", "from": "boss@x.test"})
check("JSON email becomes a to-do", s == 201, d)
s, d = req("POST", f"/api/inbound/email/{me['mailToken']}", body={"subject": "Mailgun one", "body-plain": "hi", "sender": "a@b"}, form=True)
check("form email becomes a to-do", s == 201, d)
s, _ = req("POST", "/api/inbound/email/" + "z" * 24, body={"subject": "x"})
check("unknown mail address is 404", s == 404)
_, d = req("GET", "/api/collections/todos/records?sort=createdAt&filter=" + urllib.parse.quote("title='Pay invoice'"), tok)
item = d["items"][0] if d["items"] else {}
check("email subject parsed, sender in notes", item.get("deadline") and "boss@x.test" in item.get("notes", ""), item)

s, d = req("GET", "/api/calendar/events?from=2026-10-25&to=2026-10-31", tok)
check("subscribed calendar events come back", s == 200 and [e["title"] for e in d["items"]] == ["Dentist"], d)
s, _ = req("GET", "/api/calendar/events?from=2026-10-25&to=2026-10-31")
check("calendar needs auth", s in (401, 403))

r = urllib.request.urlopen(f"{API}/api/feed.ics?token={me['feedToken']}")
body = r.read().decode()
check("feed has the planned to-do", "Dentist checkup" in body and "plan-" in body, body[:300])
srv.shutdown()
print("ALL OK" if ok else "SOME FAILED")
