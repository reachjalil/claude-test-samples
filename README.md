<p align="center">
  <img src="./docs/readme-header.png" alt="Sample Claude Exams header" width="100%" />
</p>

# Sample Claude Exams

[![License: MIT](https://img.shields.io/badge/license-MIT-111827.svg)](./LICENSE)
[![Astro](https://img.shields.io/badge/Astro-6-dd8f70.svg)](https://astro.build/)
[![Cloudflare Workers](https://img.shields.io/badge/deploy-Cloudflare%20Workers-f59e0b.svg)](https://workers.cloudflare.com/)

Independent, open-source sample exam practice for learners who want a structured way to study Claude fundamentals, prompt design, evaluation patterns, safety tradeoffs, and practical AI workflows.

**Live site:** [claude-test-samples.workspaceagent.workers.dev](https://claude-test-samples.workspaceagent.workers.dev)

> This project is independent and is not affiliated with, endorsed by, or sponsored by Anthropic. It is not an official certification, exam provider, or credentialing program.

## What It Includes

- Timed, untimed, targeted, and flashcard-style practice modes.
- Question-bank pages with answers and explanations.
- Study paths organized around domains, scenarios, and task statements.
- Local-browser progress storage with no account required.
- Public disclaimer, privacy policy, and terms pages.
- Static Astro output that can deploy cleanly to Cloudflare Workers Static Assets.

## Why This Exists

Claude-related learning can be hard to organize once teams move beyond demos and into real operating habits. This project gives learners a lightweight practice environment they can inspect, fork, improve, and adapt for responsible AI education.

The goal is to make studying feel practical:

- practice with realistic scenarios
- review why an answer is right or wrong
- revisit weak domains
- keep the product privacy-friendly and simple to deploy

## Quick Start

```bash
pnpm install
pnpm dev
```

The local site runs with Astro. By default, Astro will print the development URL in your terminal.

## Useful Scripts

```bash
pnpm dev          # Start the local development server
pnpm run check    # Run Astro/TypeScript checks
pnpm run build    # Build the static site
pnpm run quality  # Run check and build
pnpm run deploy   # Build and deploy with Wrangler
```

Data utilities are also available:

```bash
pnpm run data:extract
pnpm run data:build-additional
pnpm run data:all
```

## Project Structure

```text
src/
  components/        Shared UI and exam experience components
  data/              Question banks, study guides, and typed data models
  layouts/           Astro layout shell
  lib/               Exam engine and scoring helpers
  pages/             Multipage site routes
  styles/            Global design system styles

content/
  study-guide/       Study-guide source content

docs/
  readme-header.png  README artwork

public/
  favicon.svg
  site.webmanifest
```

## Deployment

This repository is configured for Cloudflare Workers Static Assets.

```bash
pnpm run deploy
```

Before deploying, authenticate Wrangler with a Cloudflare account that can publish Workers:

```bash
pnpm exec wrangler login
```

## Contributing

Contributions are welcome. Useful improvements include clearer explanations, better study flows, accessibility fixes, UI polish, and new original practice questions.

Please keep question content original:

- Do not copy official exam questions, private training material, or paid test-prep content.
- Prefer scenario-based questions that test reasoning, not memorization.
- Include an answer explanation for every new question.
- Keep legal, privacy, and affiliation language accurate.

Before opening a pull request, run:

```bash
pnpm run quality
```

## Legal Notice

This is an unofficial educational project. Claude and Anthropic are names associated with Anthropic, PBC. This project does not claim partnership, endorsement, exam authority, or certification authority.

The practice material is provided for learning and self-assessment only. It should not be represented as official exam content or as a guarantee of performance on any third-party assessment.

## License

MIT. See [LICENSE](./LICENSE).
