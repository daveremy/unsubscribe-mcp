#!/usr/bin/env bash
set -euo pipefail

# Release script for @daveremy/unsubscribe-mcp
# Usage: ./scripts/release.sh <patch|minor|major>

BUMP=${1:-}
if [[ -z "$BUMP" || ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

# Must be on main
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main branch (currently on $BRANCH)"
  exit 1
fi

# Ensure clean working tree
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean. Commit or stash changes first."
  exit 1
fi

# Get current and new version
OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP" --no-git-tag-version --no-commit-hooks > /dev/null
NEW_VERSION=$(node -p "require('./package.json').version")

echo "Bumping $OLD_VERSION -> $NEW_VERSION"

# Sync version to all files using node -e (portable across macOS/Linux)
node -e "
const fs = require('fs');
const v = '$NEW_VERSION';

// version.ts
const vf = 'src/version.ts';
fs.writeFileSync(vf, fs.readFileSync(vf, 'utf8').replace(/export const VERSION = \"[^\"]*\"/, \`export const VERSION = \"\${v}\"\`));

// plugin.json
const pf = '.claude-plugin/plugin.json';
const pj = JSON.parse(fs.readFileSync(pf, 'utf8'));
pj.version = v;
fs.writeFileSync(pf, JSON.stringify(pj, null, 2) + '\n');

// marketplace.json
const mf = '.claude-plugin/marketplace.json';
const mj = JSON.parse(fs.readFileSync(mf, 'utf8'));
mj.plugins[0].version = v;
fs.writeFileSync(mf, JSON.stringify(mj, null, 2) + '\n');

// CHANGELOG.md — move [Unreleased] entries into new version section
const clf = 'CHANGELOG.md';
const today = new Date().toISOString().split('T')[0];
let cl = fs.readFileSync(clf, 'utf8');
cl = cl.replace(
  /## \[Unreleased\]\n([\s\S]*?)(?=\n## |\n\[|$)/,
  \`## [Unreleased]\n\n## [\${v}] - \${today}\n\$1\`
);
cl = cl.replace(
  /\[Unreleased\]:.*$/m,
  \`[Unreleased]: https://github.com/daveremy/unsubscribe-mcp/compare/v\${v}...HEAD\`
);
const vLink = \`[\${v}]: https://github.com/daveremy/unsubscribe-mcp/compare/v${OLD_VERSION}...v\${v}\`;
cl = cl.replace(/(\[Unreleased\]:.*\n)/, \`\$1\${vLink}\n\`);
fs.writeFileSync(clf, cl);
"

# Build and verify
echo "Building..."
npm run build

echo "Verifying package contents..."
npm pack --dry-run

echo ""
read -p "Publish @daveremy/unsubscribe-mcp@$NEW_VERSION? [y/N] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted. Version bumped but not committed."
  exit 1
fi

# Commit and tag
git add package.json package-lock.json src/version.ts .claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md
git commit -m "Release v$NEW_VERSION"
git tag "v$NEW_VERSION"

# Publish FIRST (before push — if publish fails, no tag escapes to remote)
npm publish --access public

# Push AFTER successful publish
git push origin main
git push origin "v$NEW_VERSION"

echo "Published @daveremy/unsubscribe-mcp@$NEW_VERSION"

# Update aggregated marketplace if available
PLUGINS_DIR="$HOME/code/claude-plugins"
if [[ -d "$PLUGINS_DIR" ]]; then
  echo "Updating aggregated marketplace..."
  cd "$PLUGINS_DIR"
  git pull origin main
  node -e "
    const fs = require('fs');
    const mf = '.claude-plugin/marketplace.json';
    const mj = JSON.parse(fs.readFileSync(mf, 'utf8'));
    const plugin = mj.plugins.find(p => p.name === 'unsubscribe-mcp');
    if (plugin) {
      plugin.version = '$NEW_VERSION';
      fs.writeFileSync(mf, JSON.stringify(mj, null, 2) + '\n');
      console.log('Updated unsubscribe-mcp to $NEW_VERSION in aggregated marketplace');
    } else {
      console.log('Warning: unsubscribe-mcp not found in aggregated marketplace — add it manually');
    }
  "
  git add .claude-plugin/marketplace.json
  git commit -m "Update unsubscribe-mcp to v$NEW_VERSION" || true
  git push origin main
else
  echo "Warning: ~/code/claude-plugins not found — update aggregated marketplace manually"
fi
