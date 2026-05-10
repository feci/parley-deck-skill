# WinGet Packaging

This directory contains a draft manifest for submitting Parley Deck Skill to the
Windows Package Manager Community Repository.

The package is intentionally modeled as a portable executable:

- WinGet installs `parley-deck-skill.exe` as a command.
- The user then runs `parley-deck-skill install --target all --force`.
- No Node.js runtime is required on the user's machine.

## First Submission

1. Publish a GitHub release with Windows assets:

   ```text
   parley-deck-skill-vX.Y.Z-windows-x64.exe
   parley-deck-skill-vX.Y.Z-windows-arm64.exe
   ```

2. Copy the matching manifest directory into a fork of `microsoft/winget-pkgs`:

   ```text
   manifests/f/Feci/ParleyDeckSkill/X.Y.Z/
   ```

3. Validate on Windows:

   ```powershell
   winget validate .\manifests\f\Feci\ParleyDeckSkill\X.Y.Z
   winget install --manifest .\manifests\f\Feci\ParleyDeckSkill\X.Y.Z
   ```

4. Open a pull request to `microsoft/winget-pkgs`.

The first PR may trigger the Microsoft CLA bot. Follow the bot instructions once;
there is no npm-style registry account for WinGet.
