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
VERSION="x.y.z" # package version without the leading v
git tag "v${VERSION}"
git push origin main "v${VERSION}"
```

## Homebrew Tap

The canonical Homebrew formula lives only in the separate tap repository:

```text
https://github.com/feci/homebrew-parley
```

Do not keep a copy of the formula in this repository. Update the tap directly so the release metadata cannot drift between repositories.

Generate the release tarball checksum:

```bash
VERSION="x.y.z" # package version without the leading v
curl -fsSL -o "/tmp/parley-deck-skill-v${VERSION}.tar.gz" \
  "https://github.com/feci/parley-deck-skill/archive/refs/tags/v${VERSION}.tar.gz"
shasum -a 256 "/tmp/parley-deck-skill-v${VERSION}.tar.gz"
```

Then edit the tap formula:

```text
feci/homebrew-parley/Formula/parley-deck-skill.rb
```

Set `url` and `sha256` to the new release values. The formula install block should stay minimal:

```ruby
def install
  libexec.install Dir["*"]
  bin.install_symlink libexec/"bin/parley-deck-skill.js" => "parley-deck-skill"
end
```

Run where Homebrew is available:

```bash
brew style Formula/parley-deck-skill.rb
brew audit --strict --online feci/parley/parley-deck-skill
brew upgrade parley-deck-skill
brew test feci/parley/parley-deck-skill
parley-deck-skill --version
```
