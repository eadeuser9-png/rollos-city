# Rollo's City 🦝
## 🌐 Live Demo

****[Visit Rollo's City](https://dazzling-pithivier-0c7b59.netlify.app)****

Explore Rollo's City, a persistent virtual world
where an autonomous AI raccoon explores, interacts
with visitors, reads books, and develops interests
through his experiences.

**An experimental autonomous-agent town, built as a browser experience with a persistent cloud simulation.**

Rollo is a fictional raccoon who explores a small town called North Quay. A scheduled Cloudflare Worker advances the simulation independently of whether anyone has the website open. His choices, interests, journal, reading sessions, and visitor interactions can be recorded in Cloudflare D1.

> **Portfolio note:** This is a simulation and ongoing prototype, not a conscious AI or a production-hardened autonomous agent. Some behavior is deterministic and some is optionally AI-assisted using Cloudflare Workers AI. The project was developed iteratively with AI-assisted coding tools, design decisions, testing, and deployment work.

## Demo

**Live website:** Add your public Netlify URL here once ready to share.

The hosted demo uses my separately deployed Cloudflare Worker and database. This repository provides source code and examples, **not** credentials, private visitor records, or a live database export.

## Project features

- **Persistent autonomous town:** Clock-driven activity and exploration continue on the backend on a schedule, not just while a visitor has a tab open.
- **Emerging interests:** Experience-driven interest scores can affect later choices, questions, and behavior.
- **Book library:** Project Gutenberg catalog imports and owner-supplied, permitted TXT/PDF text; reading activity records actual passages and progress. Optional model-assisted observations require an exact supporting quote.
- **Community interactions:** Visitors can post or suggest books; the owner moderates suggestions before approval. Suggesting a book never forces Rollo to read it.
- **Creator console:** Authenticated owner conversation and administrative controls are distinct from visitor-facing interactions.
- **Town exploration and visual interface:** Interactive browser world with buildings, destinations, and independent simulated residents.
- **Creative and marketplace experiments:** Artwork, simulated budget and spending protections, and optional printing / storefront integrations, with real purchases disabled in the sample configuration.

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript, Netlify static hosting |
| Backend | Cloudflare Workers, scheduled cron trigger |
| Persistence | Cloudflare D1 (SQLite), Cloudflare R2 for print assets |
| Model calls | Optional Cloudflare Workers AI integration |
| Testing | Node.js built-in test runner |

## Repository structure

```text
site/          Browser application and world UI
cloudflare/    Worker, simulation modules, schema migrations, sample Wrangler configuration
tests/         Automated behavior, permission and regression tests
tools/         Local image/PDF processing utilities
```

## Local testing

From the repository root:

```bash
cd cloudflare
npm test
```

Tests check agent behavior, privacy and owner controls, reading and source grounding, community book approvals, and other simulation behavior. **Passing tests do not verify that a separately deployed live site is functioning.**

## Deployment overview

1. Provision your own Cloudflare Worker with D1 database, required R2 bindings, and (optionally) Workers AI.
2. Configure the Worker using `cloudflare/wrangler.example.jsonc` as a reference. Create your own **private** `cloudflare/wrangler.jsonc` with your resource IDs and deployment values.
3. Set authentication and other credentials as Cloudflare secrets; do **not** commit credentials, environment files, or database exports.
4. Apply only the appropriate database schema/migrations in order for the installation state, deploy the Worker, then set `site/config.js` to your public Worker URL.
5. Publish the contents of `site/` through your own Netlify project.

This repository is not a plug-and-play installation: operational settings and external integrations need configuration. Do not execute every versioned schema migration blindly against an existing database.

## Engineering considerations and limitations

- Autonomous choices are constrained by a simulated world and implementation-defined rules, not unlimited open-ended intelligence.
- AI observations are evidence-filtered, but exact quotations do **not** guarantee that an interpretation is correct.
- Owner actions require server-side authorization; public visitor actions have rate limits, but identity is pseudonymous and not designed for large-scale abuse resistance.
- Third-party literary works must be used only when public domain or appropriately licensed / permitted. Books and private user submissions are **not included** here.
- Real money movement is disabled by default. An eventual production shop would require further financial, privacy, and operational safeguards.

## What I learned

A full-stack, AI-assisted software project with real deployment, evolving requirements, persistence, frontend design, cloud configuration, moderation, and testing. The project has helped me practice translating complex product ideas into working, testable features while iterating on the user experience.
