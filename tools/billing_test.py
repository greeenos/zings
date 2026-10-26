# Hosted-plan hooks (free limits, Stripe and NOWPayments webhooks). Start a throwaway instance in host networking:
#   docker run -d --network host -e ZINGS_HOSTED=1 -e ZINGS_FREE_TODO_LIMIT=3 -e STRIPE_WEBHOOK_SECRET=whsec_test \
#     -e NOWPAYMENTS_IPN_SECRET=ipn_test -e STRIPE_SECRET_KEY=sk_test_fake -e STRIPE_PRICE_MONTH=m -e STRIPE_PRICE_YEAR=y \
#     -e NOWPAYMENTS_API_KEY=np_fake -v $PWD/pb_hooks:/pb/pb_hooks:ro -v $PWD/pb_migrations:/pb/pb_migrations:ro zings:dev \
#     /pb/pocketbase serve --http=127.0.0.1:8094 --dir=/pb/pb_data --hooksDir=/pb/pb_hooks --migrationsDir=/pb/pb_migrations
# Hosted-plan hooks against a throwaway instance on :8094 started with
# ZINGS_HOSTED=1 ZINGS_FREE_TODO_LIMIT=3 STRIPE_WEBHOOK_SECRET=whsec_test
# NOWPAYMENTS_IPN_SECRET=ipn_test STRIPE_SECRET_KEY=sk_test_fake NOWPAYMENTS_API_KEY=np_fake.
import hashlib, hmac, json, sys, time, urllib.request

API = "http://127.0.0.1:8094"

def req(method, path, token=None, body=None, raw=None, headers=None):
    data = raw.encode() if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(API + path, method=method, data=data)
    r.add_header("content-type", "application/json")
    for k, v in (headers or {}).items(): r.add_header(k, v)
    if token: r.add_header("Authorization", token)
    try:
        with urllib.request.urlopen(r) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

ok = True
def check(label, cond, extra=""):
    global ok
    print(("PASS " if cond else "FAIL ") + label + ("" if cond else f"  {extra}"))
    ok &= bool(cond)

def user(email):
    req("POST", "/api/collections/users/records", body={"email": email, "password": "testtest123", "passwordConfirm": "testtest123"})
    _, d = req("POST", "/api/collections/users/auth-with-password", body={"identity": email, "password": "testtest123"})
    return d["token"], d["record"]

s, _ = req("POST", "/api/collections/users/records", body={"email": "hack@b.test", "password": "testtest123", "passwordConfirm": "testtest123", "paidUntil": "2099-01-01"})
check("signup can't set paidUntil", s == 400)
user("hack@b.test")
tok, me = user("free@b.test")
uid = me["id"]

_, st = req("GET", "/api/billing/status", tok)
check("status: hosted, free, limit 3", st.get("hosted") and not st.get("pro") and st.get("freeTodoLimit") == 3, st)

for i in range(3):
    req("POST", "/api/collections/todos/records", tok, {"owner": uid, "title": f"t{i}", "list": "inbox"})
s, d = req("POST", "/api/collections/todos/records", tok, {"owner": uid, "title": "t4", "list": "inbox"})
check("4th open to-do refused on free", s == 400 and "free plan" in d.get("message", ""), d)

s, _ = req("PATCH", f"/api/collections/users/records/{uid}", tok, {"paidUntil": "2099-01-01"})
check("user can't grant themselves Pro", s == 400)

req("POST", "/api/collections/projects/records", tok, {"id": "billproject0001", "owner": uid, "name": "P"})
s, d = req("POST", "/api/share/invite", tok, {"projectId": "billproject0001", "email": "hack@b.test"})
check("sharing needs Pro", s == 402, d)

s, d = req("POST", "/api/billing/stripe/checkout", tok, {"interval": "year"})
check("checkout reaches Stripe (fake key is rejected by Stripe)", s == 400 and "API Key" in d.get("message", ""), d)

# Stripe: invoice.paid, signed like Stripe does.
end = int(time.time()) + 30 * 86400
evt = json.dumps({"id": "evt_1", "type": "invoice.paid", "data": {"object": {
    "id": "in_1", "customer": "cus_1", "customer_email": "free@b.test", "amount_paid": 200, "currency": "eur",
    "lines": {"data": [{"period": {"end": end}}]}}}})
t = int(time.time())
sig = hmac.new(b"whsec_test", f"{t}.{evt}".encode(), hashlib.sha256).hexdigest()
s, _ = req("POST", "/api/billing/stripe/webhook", raw=evt, headers={"Stripe-Signature": f"t={t},v1=bad"})
check("unsigned Stripe webhook refused", s == 400)
s, d = req("POST", "/api/billing/stripe/webhook", raw=evt, headers={"Stripe-Signature": f"t={t},v1={sig}"})
check("signed invoice.paid accepted", s == 200, d)
_, st = req("GET", "/api/billing/status", tok)
check("user is Pro until period end + grace, auto-renewing", st.get("pro") and st.get("autoRenews"), st)
first_until = st.get("paidUntil")
req("POST", "/api/billing/stripe/webhook", raw=evt, headers={"Stripe-Signature": f"t={t},v1={sig}"})
_, st = req("GET", "/api/billing/status", tok)
check("a retried webhook doesn't extend twice", st.get("paidUntil") == first_until, st)

s, d = req("POST", "/api/collections/todos/records", tok, {"owner": uid, "title": "t4", "list": "inbox"})
check("Pro lifts the to-do limit", s == 200, d)

# NOWPayments IPN: keys sorted, HMAC-SHA512.
ipn = {"payment_id": 5551, "payment_status": "finished", "order_id": f"{uid}:123", "price_amount": 20, "price_currency": "eur"}
canon = json.dumps(ipn, sort_keys=True, separators=(",", ":"))
good = hmac.new(b"ipn_test", canon.encode(), hashlib.sha512).hexdigest()
s, _ = req("POST", "/api/billing/crypto/ipn", raw=json.dumps(ipn), headers={"x-nowpayments-sig": "00"})
check("unsigned IPN refused", s == 400)
s, d = req("POST", "/api/billing/crypto/ipn", raw=json.dumps(ipn), headers={"x-nowpayments-sig": good})
check("signed IPN accepted", s == 200 and d.get("ok"), d)
_, st = req("GET", "/api/billing/status", tok)
check("a crypto year stacks on top", st.get("paidUntil", "") > first_until and st["paidUntil"][:4] >= str(time.gmtime().tm_year + 1), st)
s, d = req("POST", "/api/billing/crypto/invoice", tok)
check("crypto invoice reaches NOWPayments (fake key rejected)", s == 502, d)
print("ALL OK" if ok else "SOME FAILED")
