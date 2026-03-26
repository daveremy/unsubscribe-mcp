# Roadmap

## Review Feedback (out-of-scope for scaffold, captured for implementation phases)

### Phase 2: Core Implementation
- **Gmail scope validation** (gemini, round 1): At startup, verify that gws OAuth token includes `gmail.send` scope (needed for mailto fallback). Surface clear error if scope is missing.
- **User-Agent header** (gemini, round 1): Use a browser-like User-Agent string for HTTPS GET/POST requests to avoid WAF blocks on bare node-fetch headers.
- **Cookie handling for GET fallback** (gemini, round 1): Some unsubscribe links set session cookies on redirect hops. Consider cookie jar support for the GET fallback chain.

### Phase 4: Hardening
- **Scope documentation** (gemini, round 1): Document required Gmail API scopes (`gmail.readonly` for reading headers, `gmail.send` for mailto) in README and CLAUDE.md.
