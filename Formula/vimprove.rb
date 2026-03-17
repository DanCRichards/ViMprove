class Vimprove < Formula
  desc "Analyze your Vim keystrokes and get personalized improvement tips"
  homepage "https://github.com/DanCRichards/ViMprove"
  license "MIT"

  head "https://github.com/DanCRichards/ViMprove.git", branch: "main"

  # Update url and sha256 when a versioned release is tagged:
  #   git tag v0.1.0 && git push origin v0.1.0
  #
  # url "https://github.com/DanCRichards/ViMprove/archive/refs/tags/v0.1.0.tar.gz"
  # sha256 "<run: brew fetch --build-from-source Formula/vimprove.rb>"

  depends_on "node"

  def install
    cd "cli" do
      system "npm", "ci"
      system "npm", "run", "build"
    end

    # CLI binary
    bin.install "cli/dist/vimprove.js" => "vimprove"

    # NeoVim plugin — installed to $(brew --prefix)/share/vimprove/
    # Users can source it from there or run `vimprove install-plugin`
    (share/"vimprove").install "neovim/vim_improver.lua"

    # VSCode extension files
    (share/"vimprove/vscode").install "vscode/extension.js"
    (share/"vimprove/vscode").install "vscode/package.json"
  end

  def post_install
    # Create the log directory used by the NeoVim plugin and VSCode extension
    (var/"vimprove").mkpath
  end

  def caveats
    neovim_plugin = share/"vimprove/vim_improver.lua"
    vscode_dir    = share/"vimprove/vscode"
    <<~EOS
      #{Tty.bold}NeoVim setup:#{Tty.reset}
        Copy the plugin to your NeoVim lua directory:
          cp #{neovim_plugin} ~/.config/nvim/lua/

        Then add to your init.lua:
          require('vim_improver').setup()

      #{Tty.bold}VSCode setup:#{Tty.reset}
        Copy the extension to your VSCode extensions directory:
          cp -r #{vscode_dir} ~/.vscode/extensions/vim-improver-0.1.0
        Or install from the VSIX:
          code --install-extension #{vscode_dir}/vim-improver-0.1.0.vsix

      #{Tty.bold}Usage:#{Tty.reset}
        vimprove help
        vimprove report
        vimprove tips --source nvim --since 7d
    EOS
  end

  test do
    assert_match "Vim Improver", shell_output("#{bin}/vimprove help")
  end
end
