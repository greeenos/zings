# API-rule check for shared projects. Run against a throwaway instance:
#   python3 tools/share_rules_test.py http://127.0.0.1:8094
# Two users, one shared project: checks the API rules end to end.
import json, sys, urllib.request
API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8094"

def req(method, path, token=None, body=None):
    r = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    r.add_header("content-type", "application/json")
    if token: r.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(r) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def user(email):
    req("POST", "/api/collections/users/records", body={"email": email, "password": "testtest123", "passwordConfirm": "testtest123"})
    _, d = req("POST", "/api/collections/users/auth-with-password", body={"identity": email, "password": "testtest123"})
    return d["token"], d["record"]["id"]

a, aid = user("a@t.test")
b, bid = user("b@t.test")
c, cid = user("c@t.test")
ok = True
def check(label, cond):
    global ok
    print(("PASS " if cond else "FAIL ") + label)
    ok &= bool(cond)

req("POST", "/api/collections/projects/records", a, {"id": "sharedproj00001", "owner": aid, "name": "Home"})
req("POST", "/api/collections/projects/records", a, {"id": "privateproj0001", "owner": aid, "name": "Secret"})
req("POST", "/api/collections/todos/records", a, {"id": "atodo0000000001", "owner": aid, "title": "Milk", "projectId": "sharedproj00001"})
req("POST", "/api/collections/todos/records", a, {"id": "atodo0000000002", "owner": aid, "title": "Diary", "projectId": "privateproj0001"})
req("POST", "/api/collections/todos/records", a, {"id": "atodo0000000003", "owner": aid, "title": "Loose"})

s, _ = req("PATCH", "/api/collections/projects/records/sharedproj00001", b, {"members": [bid]})
check("B cannot add itself to A's project", s == 404)
s, _ = req("PATCH", "/api/collections/projects/records/sharedproj00001", a, {"members": [bid]})
check("A adds B as member", s == 200)

_, d = req("GET", "/api/collections/projects/records", b)
check("B sees only the shared project", [p["id"] for p in d["items"]] == ["sharedproj00001"])
_, d = req("GET", "/api/collections/todos/records", b)
check("B sees only the shared todo", [t["id"] for t in d["items"]] == ["atodo0000000001"])
s, _ = req("PATCH", "/api/collections/todos/records/atodo0000000001", b, {"completed": True})
check("B completes A's shared todo", s == 200)
s, _ = req("PATCH", "/api/collections/todos/records/atodo0000000001", b, {"owner": bid})
check("B cannot take ownership", s in (400, 403, 404))
s, _ = req("PATCH", "/api/collections/todos/records/atodo0000000002", b, {"title": "x"})
check("B cannot touch A's private todo", s == 404)
s, _ = req("POST", "/api/collections/todos/records", b, {"id": "btodo0000000001", "owner": bid, "title": "Bread", "projectId": "sharedproj00001"})
check("B adds a todo to the shared project", s == 200)
_, d = req("GET", "/api/collections/todos/records", a)
check("A sees B's todo in the shared project", "btodo0000000001" in [t["id"] for t in d["items"]])
s, _ = req("POST", "/api/collections/todos/records", b, {"id": "btodo0000000002", "owner": bid, "title": "Spam", "projectId": "privateproj0001"})
check("B cannot file into A's private project", s == 400)
s, _ = req("PATCH", "/api/collections/todos/records/btodo0000000001", b, {"projectId": "privateproj0001"})
check("B cannot move a todo into A's private project", s in (400, 404))
s, _ = req("PATCH", "/api/collections/projects/records/sharedproj00001", b, {"name": "Our home"})
check("B renames the shared project", s == 200)
s, _ = req("PATCH", "/api/collections/projects/records/sharedproj00001", b, {"members": [bid, cid]})
check("B cannot change members", s in (400, 403, 404))
s, _ = req("DELETE", "/api/collections/projects/records/sharedproj00001", b)
check("B cannot delete the project", s in (403, 404))
_, d = req("GET", "/api/collections/todos/records", c)
check("C sees nothing", d["items"] == [])
s, _ = req("POST", "/api/collections/todos/records", c, {"id": "ctodo0000000001", "owner": cid, "title": "Mine"})
check("C still creates its own todos", s == 200)
s, _ = req("POST", "/api/share/invite", b, {"projectId": "sharedproj00001", "email": "c@t.test"})
check("B (member) cannot invite", s == 404)
s, _ = req("POST", "/api/share/invite", a, {"projectId": "sharedproj00001", "email": "nobody@t.test"})
check("Unknown email is a 404", s == 404)
s, _ = req("POST", "/api/share/invite", a, {"projectId": "sharedproj00001", "email": "C@T.test"})
check("A invites C by email (case-insensitive)", s == 200)
_, d = req("GET", "/api/collections/projects/records", c)
check("C now sees the project", [p["id"] for p in d["items"]] == ["sharedproj00001"])
s, d = req("GET", "/api/share/members?projectId=sharedproj00001", b)
check("Members list shows owner + 2", s == 200 and [m["owner"] for m in d["items"]] == [True, False, False])
s, _ = req("POST", "/api/share/remove", b, {"projectId": "sharedproj00001", "userId": cid})
check("B cannot remove C", s == 403)
s, _ = req("POST", "/api/share/remove", c, {"projectId": "sharedproj00001", "userId": cid})
check("C leaves", s == 200)
_, d = req("GET", "/api/collections/projects/records", c)
check("C no longer sees it", d["items"] == [])
s, _ = req("GET", "/api/share/members?projectId=privateproj0001", b)
check("B cannot list a private project", s == 404)
print("ALL OK" if ok else "SOME FAILED")
