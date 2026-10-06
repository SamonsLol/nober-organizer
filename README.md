<a href="https://www.buymeacoffee.com/samons" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
       alt="Buy Me A Coffee"
       style="height: 20px !important;width: 100px !important;">
</a>

# Nober Organizer

**English** · [Español](README.es.md)

**An open-source, self-hosted school planner** for students: courses with a weekly timetable, tasks, calendar,
grades by term, topics, resources and class notes in [AFFiNE](https://affine.pro), all in one place.
Dark and light themes, built for desktop and mobile.

> The interface is in Spanish (Colombian format: 24 h, weeks start on Monday). Help translating it is welcome.

![Home](docs/screenshots/inicio.png)

| Tasks (board) | Calendar (week) |
| --- | --- |
| ![Tasks](docs/screenshots/tareas.png) | ![Calendar](docs/screenshots/calendario.png) |
| **Grades** | **Course** |
| ![Grades](docs/screenshots/calificaciones.png) | ![Course](docs/screenshots/materia.png) |

## Features

- **Home**: what's most urgent, today's classes, this week's tasks, upcoming assignments and exams, term average,
  focus timer, goals and a monthly calendar. New accounts get a getting-started guide.
- **Courses**: color, cover, teacher, room and a **weekly timetable** (the calendar generates classes from it).
  Each course has an overview, classes, topics (board by preparation level), tasks, notes, resources and grades.
- **Tasks**: list, board (drag and drop) and by-date views; steps, links, tags, priority, notes and file attachments.
- **Calendar**: month, week and agenda views with classes, deadlines, exams, events and **holidays** (they remove
  that day's classes).
- **Grades**: configurable scale (1.0–5.0 by default, passing at 3.0), weighted terms, scores on a different scale
  (85/100 → 4.3), the grade you still need to pass, and a simulator.
- **Notes in AFFiNE**: every class links to its document, which opens embedded in a side panel. Content is never
  copied into the app; it stays in your AFFiNE.
- **Accounts**: email and password (Google optional) with [Better Auth](https://better-auth.com). Each user only
  sees their own data, and sign-ups can be closed once your account exists.

## Integrations

- **AFFiNE via MCP** (0.27+): with a workspace token, each class offers "Crear apunte" (create note), which creates
  the document from a template and links it. The token is stored encrypted.
- **Google Calendar**: a dedicated calendar with recurring classes (skipping holidays), tasks, assessments and
  events, without duplicates. Minimal permission: only calendars created by the app.
- **Files**: upload PDFs, documents, images, audio or video to tasks and resources (only the owner can open them).
- **PWA**: install it on your phone from the browser ("Add to Home Screen").

Setup instructions are in the deployment guide ([`deploy/README.md`](deploy/README.md), in Spanish).

## Self-hosting (Docker)

Requirements: a server with Docker and Docker Compose, and a domain with HTTPS (nginx, Caddy, Cloudflare…).

```bash
git clone https://github.com/SamonsLol/nober-organizer.git
cd nober-organizer
cp .env.production.example .env.production   # fill in: passwords, domain, AFFiNE
docker compose --env-file .env.production up -d --build
curl -s http://127.0.0.1:3100/api/health     # {"ok":true,"db":true}
```

Then expose `127.0.0.1:3100` through your reverse proxy (nginx template in
[`deploy/nginx/nober.conf`](deploy/nginx/nober.conf)). The full guide (DNS, nginx, first run, updates and backups)
is in [`deploy/README.md`](deploy/README.md).

### AFFiNE

Works with AFFiNE Cloud or a self-hosted instance. For the embedded panel to stay signed in, **self-host AFFiNE on
the same domain** as the app (e.g. `notes.example.com` and `planner.example.com`): browsers block third-party
cookies inside iframes.

| Variable | Meaning |
| --- | --- |
| `NEXT_PUBLIC_AFFINE_ORIGIN` | Your AFFiNE URL (defaults to `https://app.affine.pro`) |
| `NEXT_PUBLIC_AFFINE_WORKSPACE` | Workspace ID: what comes after `/workspace/` in AFFiNE's URL |

They are baked in at build time: if you change them, run again with `--build`.

## Development

Requirements: Node 22 or newer and Docker (for PostgreSQL).

```bash
npm install
cp .env.example .env        # generate BETTER_AUTH_SECRET (the command is in the file)
npm run db:up               # PostgreSQL 17 on localhost:5433
npm run db:migrate
npm run db:seed             # demo user demo@example.com / nober-demo-2026 with sample data
npm run dev                 # http://localhost:3000
```

Without `DATABASE_URL` the app starts in **demo mode** (sample data in memory, no sign-in), handy for UI work.

Other commands: `npm run lint` (TypeScript), `npm run build`, `npm run db:studio` (Prisma Studio).

### Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 + PostgreSQL ·
Better Auth · date-fns · lucide-react. No component library: the design system is custom
(`src/app/globals.css` and `src/components/blocks`).

```
src/
  app/(app)/          screens (home, calendar, tasks, courses, notes, grades, resources, settings)
  app/api/            auth, files and health
  components/         one view per screen, editors (dialogs) and design blocks
  lib/actions/        Server Actions (validated with zod, always scoped to the user)
  lib/data/           data layer: loads the user's data and derives what each screen needs
  lib/affine*.ts      AFFiNE integration (links and MCP client), isolated
prisma/               schema, migrations and seed
deploy/               nginx template and deployment guide
```

## Roadmap

- Reminders (push notifications) for deadlines and exams.
- Read other Google calendars (read-only).
- Data export and import.
- Interface translations.

## Contributing

Contributions are welcome! See [`CONTRIBUTING.md`](CONTRIBUTING.md) (in Spanish). Please don't open public issues
for security problems; contact the maintainer instead.

## License

Copyright (C) 2026 Samuel and Nober Organizer contributors.

Licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). You can use, study, modify and
share it; if you run a modified version as a web service, you must offer its source code to its users. The app
links to its source in the sign-in page and in Settings; set `NEXT_PUBLIC_SOURCE_URL` to your fork if you change it.

Original design and code; the content structure is inspired by academic Notion templates, with no affiliation to
their authors.
