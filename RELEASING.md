# Releasing Parley Deck Skill

This repository publishes a portable `SKILL.md` package plus a small dependency-free installer.

## Preflight

```bash
npm test
npm pack --dry-run
npm run build:portable:current
node bin/parley-deck-skill.js install --target all --dry-run
node bin/parley-deck-skill.js doctor --target all --json
```

Ask a second model to review the final diff before publishing. Use this checklist:

- cross-platform path handling
- safe overwrite, update, and uninstall behavior
- Codex, Claude, and Gemini target correctness
- npm package file whitelist
- portable binary build and asset upload
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

## Portable Release Assets

Portable Windows executables are built with `@yao-pkg/pkg` and uploaded to each GitHub release by `.github/workflows/release-portable.yml`.

Manual build:

```bash
npm ci
npm run build:portable:windows
```

Expected artifacts:

```text
dist/parley-deck-skill-vX.Y.Z-windows-x64.exe
dist/parley-deck-skill-vX.Y.Z-windows-arm64.exe
```

After release publication, verify the assets are attached and that the workflow passed. These `.exe` files are the inputs for WinGet manifests.

## WinGet

WinGet uses the Windows executables from the GitHub release. The draft manifest lives under:

```text
packaging/winget/manifests/f/Feci/ParleyDeckSkill/X.Y.Z/
```

After the release assets exist, update the manifest hashes from the final GitHub release assets. Do not use hashes from a local build if the release workflow uploaded or clobbered assets.

```bash
gh release view "v${VERSION}" --json assets --jq '.assets[] | [.name, .digest] | @tsv'
```

Then copy the manifest directory into a fork of `microsoft/winget-pkgs`, validate on Windows, and open a pull request.

```powershell
winget validate .\manifests\f\Feci\ParleyDeckSkill\X.Y.Z
winget install --manifest .\manifests\f\Feci\ParleyDeckSkill\X.Y.Z
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
