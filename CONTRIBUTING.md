# Contributing to nexu

Thanks for your interest in contributing! Here's how to get started.

## Reporting bugs

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Node version, OS, and any relevant config

## Feature requests

Open an issue describing the use case first. Let's discuss before writing code — it saves everyone time.

## Pull requests

1. Fork the repo and create your branch from `main`
2. Branch naming: `feat/short-description`, `fix/short-description`, `docs/short-description`
3. Keep PRs focused — one feature or fix per PR
4. Write a clear description of what changed and why

### Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add ollama embedding support
fix: handle empty chunks in ast parser
docs: update architecture diagram
chore: bump dependencies
```

### Code style

- Run `pnpm lint` before pushing
- Prettier handles formatting (config in `.prettierrc`)
- TypeScript strict mode — no `any` unless absolutely necessary

## Development setup

```bash
git clone https://github.com/nicolascine/nexu
cd nexu
pnpm install
cp apps/api/.env.example apps/api/.env.local
# add your API keys
pnpm dev
```

## Architecture

Check `docs/` for architecture docs and diagrams. The codebase is a pnpm monorepo:

```
apps/
  api/        # backend — ingestion, retrieval, chat
docs/         # architecture documentation
```

## Questions?

Open an issue or reach out on X [@nicolascine](https://twitter.com/nicolascine).
