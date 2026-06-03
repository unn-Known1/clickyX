# Contributing to ClickyX

## Code of Conduct

Be respectful, constructive, and inclusive. Harassment and discrimination are not tolerated.

## Development Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Pull Request Guidelines

- Keep PRs focused on a single concern
- Write clear commit messages
- Include tests for new functionality
- Update documentation as needed
- Ensure `cargo check` and `npm run build` pass

## Code Style

### Rust
- Follow Rust 2021 edition idioms
- Use `cargo fmt` for formatting
- Use `cargo clippy` for linting
- No `unwrap()` or `expect()` in library code (use `?` or proper error handling)
- No comments in code — document through clear naming and docstrings

### TypeScript/React
- Use functional components with hooks
- Use TypeScript strict mode
- Follow existing naming conventions
- No comments in code

### CSS
- Use CSS custom properties from `src/styles/theme.css`
- Follow BEM-like class naming
- Keep selectors flat (avoid deep nesting)

## Testing

- Rust tests: `cargo test`
- Manual testing: `npm run tauri dev`

## Architecture Decisions

See `docs/FEATURE_SPEC.md` for the full feature breakdown and architecture overview.

## Questions?

Open a discussion on GitHub or reach out in the project's communication channels.
