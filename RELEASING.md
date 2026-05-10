# Releasing Parley Deck Skill

This repository publishes a portable `SKILL.md` package plus a small dependency-free installer.

## Preflight

```bash
npm test
npm pack --dry-run
node bin/parley-deck-skill.js install --target all --dry-run
node bin/parley-deck-skill.js doctor --target all --json
```

Ask a second model to review the final diff before publishing. Use this checklist:

- cross-platform path handling
- safe overwrite, update, and uninstall behavior
- Codex, Claude, and Gemini target correctness
- npm package file whitelist
- Homebrew formula correctness
- README install clarity

## npm

```bash
npm publish --access public
```

The package name is `parley-deck-skill`. The primary user command is:

```bash
npx -y parley-deck-skill@latest install
```

## GitHub Tag

```bash
git tag v1.0.1
git push origin v1.0.1
```

## Homebrew Tap

The Homebrew tap should live in:

```text
https://github.com/feci/homebrew-parley
```

Copy `packaging/homebrew/Formula/parley-deck-skill.rb` into the tap as:

```text
Formula/parley-deck-skill.rb
```

Generate the release tarball checksum:

```bash
curl -L https://github.com/feci/parley-deck-skill/archive/refs/tags/v1.0.1.tar.gz | shasum -a 256
```

Replace `REPLACE_WITH_V1_0_1_TARBALL_SHA256` in the formula, then run where Homebrew is available:

```bash
brew audit --strict --online parley-deck-skill
brew install --build-from-source ./Formula/parley-deck-skill.rb
```
