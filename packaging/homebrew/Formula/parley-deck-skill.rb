# Template for feci/homebrew-parley.
# Replace the sha256 value after creating the v0.1.0 GitHub release tarball.

class ParleyDeckSkill < Formula
  desc "Installer for the Parley Deck multi-agent cooperation skill"
  homepage "https://github.com/feci/parley-deck-skill"
  url "https://github.com/feci/parley-deck-skill/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_V0_1_0_TARBALL_SHA256"
  license "Apache-2.0"

  depends_on "node"

  def install
    libexec.install "SKILL.md", "README.md", "LICENSE", "package.json"
    libexec.install "agents", "bin", "lib", "references", "gemini-extension.json"
    chmod 0755, libexec/"bin/parley-deck-skill.js"
    bin.install_symlink libexec/"bin/parley-deck-skill.js" => "parley-deck-skill"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/parley-deck-skill --version")
  end
end
