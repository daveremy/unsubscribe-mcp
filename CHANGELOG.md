# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project scaffold with MCP server and CLI entry points
- 5 MCP tools (stub implementations): list_subscriptions, get_unsubscribe_info, unsubscribe, bulk_unsubscribe, unsubscribe_status
- List-Unsubscribe header parser (RFC 2369 + RFC 8058)
- Gmail client structure with gws credential reading
- In-memory session log for unsubscribe attempts
- Claude Code plugin manifest and marketplace listing
- Skill definition for Franklin agent
- CLI with commander (list, info, unsub, bulk, status commands)

[Unreleased]: https://github.com/daveremy/unsubscribe-mcp/compare/HEAD
