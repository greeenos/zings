# Security Policy

## Supported versions

Zings is a single-track project — only the latest release on `main` receives security fixes. If you're running an older build, please update before reporting.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Instead, report privately via one of these channels:

- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/greeenos/zings/security/advisories/new) (preferred)
- **Email**: adamgreen629@gmail.com — please put `[zings security]` in the subject line

When reporting, please include:

- A description of the issue and its impact
- Steps to reproduce (or a proof-of-concept)
- The version / commit hash you tested against
- Your environment (browser, Docker tag)

## What to expect

- **Acknowledgement** within 72 hours
- **Initial assessment** within 7 days
- **Fix timeline** depends on severity — critical issues are prioritized over everything else
- You'll be credited in the release notes unless you'd rather stay anonymous

## Scope

In scope:

- The Zings web app (this repository)
- The official Docker image
- Default configuration shipped in `docker-compose.yml` and `.env.example`

Out of scope:

- Vulnerabilities in PocketBase itself — please report those to the [PocketBase project](https://github.com/pocketbase/pocketbase/security)
- Issues that require an already-compromised server or browser
- Missing security headers on the demo/marketing site (if any)
- Social engineering, physical attacks, or DoS via resource exhaustion

## Self-hosting reminders

Zings is self-hosted software — you are responsible for:

- Keeping your Zings image, Docker host, and reverse proxy up to date
- Using HTTPS in production (a reverse proxy like Caddy or Traefik is recommended)
- Keeping your calendar-feed URL private
- Backing up your Postgres database
