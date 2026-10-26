# Changelog

## 0.6.1

- **Calendar:** a month grid with to-dos in the day cells; pick a day to see its agenda in a side panel.
- **To-do details** now have labels, group headers are easier to read, and phones get a bottom tab bar.
- Settings and Account are regrouped.
- An interactive online demo, a new website, and a refreshed product video and screenshots.
- Updated user guide and donation options.

No new migrations.

## 0.6.0

A new look, plain-language input, sharing and integrations.

- **Design system v3:** the emerald tray logo everywhere (favicon, PWA and touch icons, sidebar, sign-in), Rubik Variable self-hosted, contrast-checked light and dark tokens, tactile raised buttons, selectable option cards, a green task checkbox and status colours (today blue, upcoming purple, due soon amber, overdue red). Every component state is on `/#design`.
- **Plain-language quick add** in English and Czech: "Call mom tomorrow at 5pm", "by friday", "tonight", "každé 3. úterý", "every mon and thu"; `!`, `!!`, `!!!` set priority.
- **Repeats** on the nth or last weekday of a month.
- **Attachments:** paste a screenshot or drop files on an open to-do (protected files, thumbnails for images).
- **One-at-a-time projects** show only their next step in Today and Anytime.
- **Shared projects:** invite by email; members see and edit the project's to-dos live and get a push when someone adds one.
- **Calendar subscriptions:** the `.ics` feed now carries the plan too, and subscribed Google / iCloud / Outlook calendars show in Today and the Calendar.
- **Integrations:** REST API with personal tokens, webhooks for created / completed to-dos, email-to-task endpoint.
- **AI with your own key** (Anthropic or OpenRouter): break a to-do into checklist steps; dictate or paste text and get to-dos back.
- Groundwork for the upcoming hosted Zings (free plan and Pro). Self-hosted instances are unaffected and keep every feature.
- Fix: the quick-add form could submit a draft twice.
- Leaner code, and a new 30-second showreel with captions and music.

Migrations 4–9 add fields and collections; they don't rewrite existing to-dos.

## 0.5.0

Zings now supports offline task changes and importing a Things 3 database. This release also adds server push reminders and completes the visual refresh.

- Cache loaded lists and queue task changes when the server is unreachable. Queues belong to individual accounts; failed syncs retain their changes, and full browser storage produces an error.
- Import areas, projects, headings, tasks, tags and checklists from Things 3's `main.sqlite`. Stable IDs prevent duplicates on repeated imports. Repeating templates and finished projects don't transfer.
- Enable Web Push reminders on supported HTTPS browsers. Reminder delivery depends on device connectivity and browser support. Signed-out browsers unsubscribe.
- Limit instances to five accounts, including simultaneous sign-ups; `ZINGS_MAX_USERS` can lower the limit.
- Schedule PocketBase backups at 03:00, retaining seven snapshots in the data volume.
- Add a shared logo, PWA icons and a new sign-in screen, with a narrower desktop reading column, clearer empty-project guidance and deeper dark surfaces.
- Animate task completion with a brief checkmark, a strike-through and a softer exit. Respect reduced-motion preferences.
- Require type checks, lint, tests and a production build before Docker publication; run the same checks on pull requests.
- Update the README with screenshots, import and backup instructions, and a 30-second Full HD showreel with an original soundtrack.

Existing data stays in the PocketBase volume. The new migration adds backup settings and push-related collections; it doesn't rewrite task data.
