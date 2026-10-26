# Zings user guide

## Install

> Need Docker first? <https://docs.docker.com/get-docker/>

```bash
docker run -d --name zings --restart unless-stopped \
  -p 8090:8090 -v zings:/pb/pb_data -e TZ=Europe/Prague \
  ghcr.io/greeenos/zings:latest
```

Open <http://localhost:8090> and create an account. Everything lives in the `zings` volume. An instance accepts **up to 5 accounts**, each with a private workspace, so a household can use one installation.

Prefer Compose? `curl -fsSL https://raw.githubusercontent.com/greeenos/zings/main/docker-compose.yml -o docker-compose.yml && docker compose up -d`

**Admin dashboard (optional).** `http://localhost:8090/_/` is PocketBase's admin UI: browse data, manage users, set up SMTP. Create its login once with `docker exec zings /pb/pocketbase superuser upsert you@example.com <password>`.

- **Close sign-ups** after creating your account: dashboard → *Collections* → `users` → *API Rules* → lock the *Create* rule.
- **"Forgot password"** sends an email, so it needs SMTP (dashboard → *Settings* → *Mail settings*). Without it, reset a password from the dashboard.
- **Coming from the Supabase-based Zings?** In the old app: *Account → Export everything*. In the new one: *Account → Import a backup*.

### Updating later

```bash
docker pull ghcr.io/greeenos/zings:latest && docker rm -f zings   # then the same docker run as above
```

New images are built automatically on every push to `main` and on tagged releases — see [`.github/workflows/docker.yml`](.github/workflows/docker.yml).

Type checks, lint, tests and a production build must pass before the workflow publishes an image. Pull requests run the same checks.

## What you get

- **Inbox, Today, Upcoming, Anytime, Someday, Logbook** — the same six-list rhythm Things 3 popularised
- **Areas, projects and sections** — group projects into areas, split projects into headings
- **When *and* Deadline** — schedule a task for Monday and still have it due Friday; deadlines surface in Today on their own and count down as they approach
- **This Evening** — Today splits into daytime work and everything you've deferred to the end of the day
- **Repeating to-dos** — daily / weekly / monthly / yearly, every N days, the 3rd Tuesday or last Friday of a month, anchored either to the schedule or to when you actually finish
- **Priorities** — `!`, `!!`, `!!!` in a title, or one click in the open to-do
- **Shared projects** — invite someone by email; you both see and edit the project's to-dos live, and new ones ping the others by push
- **One at a time** — mark a project sequential and only its next step shows up in Today and Anytime
- **Attachments** — paste a screenshot or drop files onto an open to-do; images show as thumbnails
- **Checklists inside a to-do** — the handful of steps a task really takes, without polluting your lists
- **Tags** — filter across every project from the sidebar
- **Multi-select & keyboard control** — arrows to move, `⇧`-arrows to extend, `⌘A`, then one key to reschedule or bin the lot
- **Quick add that reads plain language** — "Call mom tomorrow at 5pm", "Zaplatit nájem každý měsíc", "Report by friday" (see below), or pick from a calendar
- **Magic Plus** — drag the `+` onto a row to insert the new to-do exactly there
- **Quick Find (`⌘K`)** — jump to any task, project, area, tag or list from one prompt; `⌘F` searches, `?` shows the cheatsheet
- **Built-in task timer** — start it when you begin work; edit the start/end times afterwards in the Logbook
- **Activity view** — deep-work heatmap, monthly chart, and time split per project
- **Calendar view** — month grid with a per-day agenda, color-coded by project
- **Calendar subscriptions** — your plan and logbook as an `.ics` feed for Google / Apple / Outlook, and their events shown in Today and the Calendar (see below)
- **AI, with your own key** — break a to-do into checklist steps, or dictate / paste a ramble and get separate to-dos back
- **REST API, webhooks and email-to-task** — add to-dos from Shortcuts, Zapier, scripts or by forwarding an email
- **Reminders** — browser notifications for timed tasks, with Web Push on supported browsers so reminders can arrive while Zings is closed. Enable them separately on each device; HTTPS and permission are required.
- **Trash** — deleting is reversible; nothing leaves the database until you empty it
- **Export & import** — the whole workspace as one JSON file, merged by id on the way back in
- **Things 3 import** — read a local `main.sqlite` file in your browser and bring over tasks, projects, areas, tags and checklists. See [the import notes](#import-from-things-3).
- **Encrypted notes** — optional client-side AES-GCM; the server only ever sees ciphertext
- **Light, dark & auto themes** — auto follows your system's dark-mode schedule
- **PWA installable** — home-screen icon, app shortcuts, share-to-Zings, unread badge, and cached lists with a queue for offline task changes
- **Real-time sync** — open it on your phone *and* your laptop; changes (and your manual ordering) appear instantly
- **No tracking, no telemetry, no SaaS** — your data stays where you put it

### Quick add syntax

Everything is optional and can be combined in any order inside the task title. Keywords work in English and Czech, and diacritics are ignored (`#zítra` = `#zitra`).

| Type      | Examples                                            | What it does                          |
| --------- | --------------------------------------------------- | ------------------------------------- |
| `@`       | `@today`, `@Work`                                    | Files the task into a list or project (offers to create the project if it's new) |
| `#`       | `#tomorrow`, `#po`, `#15.7.`, `#2026-08-01`, `#3d`  | Sets the due date                     |
| `HH:MM`   | `9:30`, `14:00-15:00`                                | Sets an exact start time (a range also sets the estimate) |
| `!`       | `!20:00-20:30`, `!30m`, `!1h30m`, `!90`              | Time / range, or a loose duration estimate |
| `!` alone | `!`, `!!`, `!!!`                                     | Priority low / medium / high          |

Plain phrases at the end of a title work too, in English and Czech: `tomorrow at 5pm`, `v pátek v 9`, `next week`, `za 3 dny`, `tonight` (This Evening), `by friday` / `do pátku` (deadline), `every day`, `každé pondělí`, `every 2 weeks`, `every 3rd tuesday`, `every mon and thu`.

Unrecognised tokens are left in the title untouched, so `#hashtags` you actually meant survive.

### Keyboard shortcuts

**Lists** — `1`–`6` jump to Inbox / Today / Anytime / Logbook / Activity / Calendar.

**Selecting** — `↑` `↓` move through the list, `⇧`+`↑↓` extends the selection, `⌘A` selects everything in view, `Space` completes it, `⌘⌫` bins it, `Esc` clears. `⇧`-click and `⌘`-click work the way they do in Finder.

**Moving the selection** — `T` Today · `E` This Evening · `A` Anytime · `S` Someday.

**App** — `N` new to-do · `⌘K` Quick Find · `⌘F` search · `?` cheatsheet · `Esc` closes any panel.

### What it intentionally *doesn't* do

Compared to Things 3, Zings skips native Siri integration (Shortcuts can use the REST API), native menu-bar Quick Entry, and per-device sync conflict resolution beyond last-write-wins. If you need those, Things 3 is an incredible app and worth its price. Zings is for people who want the shape of that experience on their own infrastructure, for free.

## Access it from your phone, anywhere in the world (Tailscale)

Tailscale gives your devices a private, encrypted network: your phone reaches Zings from anywhere, with no port forwarding, no public IP and nothing exposed to the internet. Free for personal use.

**One command, with HTTPS.** Installing Zings as an app, reminders and note encryption all need HTTPS — browsers only allow them on secure pages. [`docker-compose.tailscale.yml`](docker-compose.tailscale.yml) puts Zings on your tailnet as its own machine with a real certificate:

1. In the [Tailscale admin console](https://login.tailscale.com/admin/dns) turn on **MagicDNS** and **HTTPS Certificates**.
2. Make an [auth key](https://login.tailscale.com/admin/settings/keys), then on the server:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/greeenos/zings/main/docker-compose.tailscale.yml
   TS_AUTHKEY=tskey-auth-... docker compose -f docker-compose.tailscale.yml up -d
   ```

3. Install Tailscale on your phone ([iOS](https://apps.apple.com/app/tailscale/id1470499037) · [Android](https://play.google.com/store/apps/details?id=com.tailscale.ipn)), open **`https://zings.<your-tailnet>.ts.net`**, and add it to your home screen (share menu → **Add to Home Screen**, or **Install** in Chrome).

The first visit takes a few seconds while Tailscale fetches the certificate. Zings opens no port on the server itself; only your tailnet can reach it.

**Already run Tailscale on the server?** Keep the plain `docker run` from [Install](#install) and add HTTPS in front of it:

```bash
sudo tailscale serve --bg 8090   # → https://<server>.<your-tailnet>.ts.net
```

Plain `http://<server>:8090` on your LAN or a `100.x.y.z` address works too; Zings just turns off app install, reminders and encryption there and tells you so in Settings.

## Configuration

There's nothing to configure. The one environment variable worth setting is `TZ` (e.g. `Europe/Prague`), which sets the local time for scheduled backups.

### Encrypted notes (optional)

Turn it on in **Account → Note encryption** and pick a passphrase. The browser encrypts notes with AES-GCM and derives the key through PBKDF2-SHA256 (600,000 iterations for new setups). Unlock with the same passphrase on each device. Older setups retain their original iteration count. Notes written before you enable encryption stay readable and can be migrated on demand; task titles and scheduling information remain unencrypted.

> **Lose the passphrase and the notes are gone.** There is no recovery — that's the point.

### Import from Things 3

Quit Things on your Mac, then open **Account → Data → Import from Things** and select its `main.sqlite` database. The file stays in your browser while Zings converts it; imported records then sync to your Zings server. Make a backup of your Things database first.

In Finder, use **Go → Go to Folder** and open `~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/`. Find the `ThingsData-…` directory, choose **Show Package Contents** on `Things Database.thingsdatabase`, and select `main.sqlite`.

The importer keeps stable IDs, so importing the same database again updates existing records. Repeating templates don't transfer; their existing scheduled tasks do. Finished, cancelled and trashed projects don't transfer, and their tasks arrive without a project.

### Offline use and backups

Open your lists once while online to cache them. Task changes made without a connection stay in this browser and sync when the server becomes reachable. A rejected change stays in the queue for recovery. Keep the browser's site data until sync finishes; signing out clears its cached data and queued changes. Account changes and push setup require a connection.

PocketBase takes a backup every day at **03:00 in the server's timezone** and keeps the last **7** in its data volume. Restore through **Admin dashboard → Settings → Backups**. Copy backups to another disk or machine as well, because the local backup shares the database's storage.

Web Push uses your browser vendor's push service to wake the service worker, which fetches the reminder from your Zings instance. The device must still be able to reach that instance, including through Tailscale when applicable. Delivery depends on the browser and operating system; Zings can't guarantee an exact notification time.

### Calendar feed

Subscribe your calendar (Google, Apple, Outlook) to your plan and logbook: scheduled to-dos show up as events (timed ones for their estimate, else 30 minutes; dated ones all day) and completed **timed** tasks as what you actually did. Add `&planned=0` to the URL for the logbook only. Standard iCalendar (`.ics`), no Google sign-in, no OAuth.

Open **Account → Calendar feed** and copy your private URL (or use **Download .ics** for a one-time import). Google Calendar: *Other calendars → From URL*. Apple Calendar: *File → New Calendar Subscription*. Anyone with the URL can read your task titles.

**How fresh is it?** The feed is live, but subscriptions refresh on the calendar app's own schedule — Apple can be every few minutes, **Google may take several hours**. Google also fetches from the public internet, so a Tailscale-only instance works with Apple or the one-time download, but not with Google's subscribe-by-URL.

### Your calendars in Zings

**Account → Your calendars** takes any `.ics` address — Google's *Secret address in iCal format*, an iCloud public calendar, Outlook's published ICS link. Events show above your to-dos in Today and in the Calendar's day agenda. The server fetches each calendar at most every 15 minutes.

### AI

Paste your own Anthropic API key in **Account → AI**. It stays on your server (the API never returns it). Then:

- **Break down** in an open to-do adds 3–8 concrete steps to its checklist.
- **Capture** in the quick-add box takes dictation or pasted text (an email, meeting notes) and returns separate to-dos to review; dates, repeats and deadlines in them are read like typed ones.

Requests go to `claude-opus-5-5` at low effort, billed to your key.

### REST API and webhooks

**Account → API & webhooks** shows your personal token.

```bash
curl -X POST https://your-zings/api/v1/todos -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"title":"Call mom tomorrow at 5pm !!"}'
curl https://your-zings/api/v1/todos?list=today -H "Authorization: Bearer $TOKEN"
curl -X POST https://your-zings/api/v1/todos/$ID/complete -H "Authorization: Bearer $TOKEN"
```

A webhook URL gets `{"event": "todo.created" | "todo.completed", "todo": {...}}` for your to-dos.

### Email to Zings

**Account → Email to Zings** shows a private endpoint; each email POSTed there becomes an Inbox to-do (subject read like a quick-add title, sender and body in the notes). It takes JSON `{subject, text, from}` or Mailgun form fields. With Cloudflare Email Routing (free), route an address like `todo@yourdomain` to a Worker:

```js
import PostalMime from "postal-mime";
export default {
  async email(message, env) {
    const mail = await PostalMime.parse(message.raw);
    await fetch(env.ZINGS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject: mail.subject ?? "", text: mail.text ?? "", from: message.from }),
    });
  },
};
```

With Mailgun, a Route with `forward("https://your-zings/api/inbound/email/<token>")` does the same.

## Build from source

You only need this if you want to hack on the code. Requires Node 20+ and the [PocketBase binary](https://pocketbase.io/docs/) on your PATH.

```bash
git clone https://github.com/greeenos/zings.git
cd zings
npm install
npm run build && pocketbase serve   # the whole app on http://localhost:8090
npm run dev                          # hot-reload UI on http://localhost:9999 (keep pocketbase running)
npm test                             # run vitest
```

Built with Preact (the React API via `@preact/compat`), Vite, TypeScript, Tailwind, Radix UI, dnd-kit and [PocketBase](https://pocketbase.io). Animations go through [`src/lib/motion.tsx`](src/lib/motion.tsx), a few-KB take on framer-motion's API over the Web Animations API. The schema is [`pb_migrations/1_init.js`](pb_migrations/1_init.js); the calendar feed and push reminders are JS hooks built from [`server/`](server/).

```
┌──────────┐   REST / realtime   ┌──────────────────────────────────┐
│ Browser  │ ──────────────────▶ │ PocketBase (Zings)  :8090        │
└──────────┘                     │ app · auth · SQLite · hooks      │
                                 └──────────────────────────────────┘
```

## FAQ

**Is it really free?** Self-hosting, yes: MIT licensed, no limits, no telemetry. Only the optional hosted service has a paid plan.

**Can multiple people share an instance?** Yes, up to 5 accounts. Each sees only its own areas, projects and to-dos. `ZINGS_MAX_USERS` can lower that cap; deleting an account frees a place.

**How do I get my data out?** Account → Data → **Export everything** writes one JSON file with every area, project, section and to-do. Import merges by id, so re-importing the same file updates existing records without duplicating them.

**Does it work offline?** Previously loaded lists remain available, and task changes queue locally until your connection returns. See [offline use and backups](#offline-use-and-backups).

**Where's my data?** The server stores it in the `zings` volume (`/pb/pb_data`). Browsers also cache lists for offline use. Export it from the app or use the dashboard's *Backups* page.

**Is this affiliated with Things 3 / Cultured Code?** No. Zings is an independent project inspired by their UX. All trademarks belong to their respective owners.

---
