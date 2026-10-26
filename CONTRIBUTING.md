# Contributing to Zings

Thanks for your interest in helping out! Zings is a small, opinionated project, so please read this before opening a big PR.

## Project philosophy

Zings is intentionally lighter than Things 3. Before proposing a feature, check that it fits the scope described in the [README](README.md):

- No areas, headings, or checklists-inside-tasks
- No calendar integrations or natural-language date parsing
- Just Inbox / Today / Upcoming / Anytime / Someday / Logbook, plus a deep-work timer

Features outside this scope will likely be declined — not because they're bad ideas, but because keeping Zings small is the point.

## Ways to contribute

- **Report bugs** via [issues](https://github.com/greeenos/zings/issues/new/choose)
- **Suggest improvements** to existing features (UX, accessibility, performance)
- **Submit pull requests** for open issues — please comment on the issue first so we can align on the approach
- **Improve docs** — README, install instructions, troubleshooting
- **Translations** are welcome once the i18n layer lands

## Development setup

```bash
git clone https://github.com/greeenos/zings
cd zings
npm install
npm run build && pocketbase serve   # API + app on :8090, leave it running
npm run dev                          # hot-reload UI on :9999
```

You'll need the [PocketBase binary](https://pocketbase.io/docs/) on your PATH; it applies `pb_migrations/` on start.

## Before you open a PR

- Run the linter and tests: `npm run lint && npm test`
- Keep PRs focused — one feature or fix per PR
- Match the existing code style (TypeScript, Tailwind, shadcn/ui components)
- Update the README if you've changed install steps, env vars, or user-visible behavior
- Add a short note to the PR description explaining the *why*, not just the *what*

## Commit messages

No strict format, but please write something a reader can understand without opening the diff. Imperative mood is preferred (`fix logbook ordering`, not `fixed logbook ordering`).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to abide by it.

## Questions?

Open a [Discussion](https://github.com/greeenos/zings/discussions) rather than an issue if you're not sure something is a bug.
