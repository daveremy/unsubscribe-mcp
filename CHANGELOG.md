# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-03-26

### Fixed
- Correct plugin manifest npm package name (was `@daveremy/unsubscribe-mcp`, now `unsubscribe-mcp`)
- Fix bin paths to use `./dist/` prefix for cross-platform compatibility
- Sync plugin.json and marketplace.json versions to match published package

### Changed
- Switch `prepublishOnly` to `prepack` so `npm pack --dry-run` also triggers a build
- README restructured per plugin guide: plugin install first, manual install, tools, CLI, skills, dev

### Added
- Project scaffold with MCP server and CLI entry points
- 5 MCP tools: list_subscriptions, get_unsubscribe_info, unsubscribe, bulk_unsubscribe, unsubscribe_status
- List-Unsubscribe header parser (RFC 2369 + RFC 8058)
- Gmail client structure with gws credential reading
- In-memory session log for unsubscribe attempts
- Claude Code plugin manifest and marketplace listing
- Skill definition for /unsubscribe workflow
- CLI with commander (list, info, unsub, bulk, status commands)
- Release script (scripts/release.sh)

[Unreleased]: https://github.com/daveremy/unsubscribe-mcp/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/daveremy/unsubscribe-mcp/commits/main
