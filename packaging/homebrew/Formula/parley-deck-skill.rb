# Template for feci/homebrew-parley.
# Replace the sha256 value after creating the v1.0.3 GitHub release tarball.

class ParleyDeckSkill < Formula
  desc "Installer for the Parley Deck multi-agent cooperation skill"
  homepage "https://github.com/feci/parley-deck-skill"
  url "https://github.com/feci/parley-deck-skill/archive/refs/tags/v1.0.3.tar.gz"
  sha256 "REPLACE_WITH_V1_0_3_TARBALL_SHA256"
  license "Apache-2.0"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/parley-deck-skill.js" => "parley-deck-skill"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/parley-deck-skill --version")
  end
end
