# Contributing to ClickyX

## Code of Conduct

Be respectful, constructive, and inclusive. Harassment and discrimination are not tolerated.

## Development Process

1. Fork the repository
2. Create a feature branch from `master`
3. Make your changes
4. Run tests and linting
5. Submit a pull request against `master`

## Pull Request Guidelines

- Keep PRs focused on a single concern
- Write clear commit messages (conventional commits preferred: `feat:`, `fix:`, `docs:`, `refactor:`)
- Include tests for new functionality
- Update documentation as needed
- Ensure `cargo check` and `npm run build` pass before submitting

## Architecture Rules (from AGENTS.md)

Before writing code, read [AGENTS.md](../AGENTS.md). Key rules:

1. **Cross-platform first** — no platform-specific code without equivalents on all 3 platforms
2. **Use AppContext** — toasts and navigation go through `src/context/AppContext.tsx`, never `window.__`
3. **Use typed bindings** — all `invoke()` calls must reference `src/bindings.ts`
4. **Use react-query** — all server data fetching uses `useQuery`/`useMutation` — no raw `useState+useEffect+invoke` for data
5. **Tests for new hooks** — any new hook under `src/hooks/` must have a `.test.ts` sibling

## Code Style

### Rust
- Follow Rust 2021 edition idioms
- Use `cargo fmt` for formatting
- Use `cargo clippy` for linting
- No `unwrap()` or `expect()` in library code (use `?` or proper error handling)

### TypeScript/React
- Use functional components with hooks
- Use TypeScript strict mode
- Follow existing naming conventions
- Prefer explicit types over inference for public APIs

### CSS
- Use CSS custom properties from `src/styles/theme.css`
- Follow BEM-like class naming
- Keep selectors flat (avoid deep nesting)

## Testing

```sh
# Run all tests before submitting a PR
cargo check                   # Rust compile check (must pass)
cargo test --all-features     # Rust unit tests
npm run build                 # TypeScript + Vite build (must pass)
npm test                      # Vitest unit tests
npm run test:e2e              # Playwright E2E
```

Manual testing:
```sh
npm run tauri dev             # Run in hot-reload dev mode
```

## Documentation

- Update `AGENTS.md` if you add new files, commands, or architectural patterns
- Update `docs/PROJECT_SPEC.md` if you change a feature's design
- Update `docs/CONFIGURATION.md` if you add or change config fields
- Update `CHANGELOG.md` → `[Unreleased]` section for any user-visible change
- Reference the correct file with `file://` links in PR descriptions

## Architecture Overview

See [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md) for the full feature breakdown and architecture overview.

## Questions?

Open a discussion or issue on GitHub.
