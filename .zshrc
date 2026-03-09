# zshrc config file
export PATH="~/.local/bin:$PATH"


# BEGIN ANSIBLE MANAGED BLOCK

if [[ "$(uname)" == "Darwin" ]]; then
  # Load homebrew shell variables
  eval "$(/opt/homebrew/bin/brew shellenv)"

  # Force certain more-secure behaviours from homebrew
  export HOMEBREW_NO_INSECURE_REDIRECT=1
  export HOMEBREW_CASK_OPTS=--require-sha
  export HOMEBREW_DIR=/opt/homebrew
  export HOMEBREW_BIN=/opt/homebrew/bin

  # Load ruby shims
  eval "$(rbenv init -)"

  # Prefer GNU binaries to Macintosh binaries.
  export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"

  # for binutils
  export PATH="/usr/local/opt/binutils/bin:$PATH"
  export LDFLAGS="-L/usr/local/opt/binutils/lib"
fi

# Load python shims
if command -v pyenv 1>/dev/null 2>&1; then
  eval "$(pyenv init -)"
fi

# Point GOPATH to our go sources
export GOPATH="$HOME/go"

# Add binaries that are go install-ed to PATH
export PATH="$GOPATH/bin:$PATH"

# Go 1.16+ sets GO111MODULE to off by default with the intention to
# remove it in Go 1.18, which breaks projects using the dep tool.
# https://blog.golang.org/go116-module-changes
export GO111MODULE=auto
# Configure Go to pull go.ddbuild.io packages.

export PATH="/usr/local/bin:${PATH}"

alias k="kubectl"
alias g="git"
export EDITOR="emacs"

if [[ "$(uname)" == "Darwin" ]]; then
  alias idea="open -na 'IntelliJ IDEA' --args '@0'"
fi

# JSON
# ---------------
#
jq-in-place() {
  jq . $1 > random-formatted-file-XXXXX.tmp && mv random-formatted-file-XXXXX.tmp $1
}

# git stuff
# ----------------
#
# checkout git branch
gco-branch() {
  local branches branch
  branches=$(git --no-pager branch -vv) &&
  branch=$(echo "$branches" | fzf +m) &&
  git checkout $(echo "$branch" | awk '{print $1}' | sed "s/.* //")
}

gdel-br() {
  git branch -D $1 # delete local branch
  git push -d origin $1 #delete remote copy of branch
}

g-push-set-upstream-origin() {
  # https://stackoverflow.com/questions/1593051/how-to-programmatically-determine-the-current-checked-out-git-branch
  branch_name="$(git symbolic-ref HEAD 2>/dev/null)"
  branch_name=${branch_name##refs/heads/}
  git push --set-upstream origin $branch_name
}

if [[ "$(uname)" == "Darwin" ]]; then
  # mac-specific stuff
  preview() {
    for file in "$@"
    do
      qlmanage -p "$file" &
    done
  }
fi

# Add RVM to PATH for scripting. Make sure this is the last PATH variable change.
export PATH="$PATH:$HOME/.rvm/bin"
export PATH="$PATH:/usr/local/bin"

# add DOOM to path
export PATH="$PATH:$HOME/.emacs.d/bin"

if command -v fzf 1>/dev/null 2>&1; then
  source <(fzf --zsh)
fi

if command -v rbenv 1>/dev/null 2>&1; then
  eval "$(rbenv init - zsh)"
fi

if [[ "$(uname)" == "Darwin" ]]; then
  echo 'export PATH="/Applications/Sublime Text.app/Contents/SharedSupport/bin:$PATH"' >> ~/.zprofile
  export ANTHROPIC_API_KEY=$(security find-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w)
fi

# Created by `pipx` on 2025-09-15 08:19:39
export PATH="$PATH:$HOME/.local/bin"

# Linux-specific settings
if [[ "$(uname)" != "Darwin" ]]; then
  PROMPT='%F{green}%n@%m%f:%F{cyan}%~%f%# '
  export COLORTERM=truecolor
fi

# Load local/private overrides (not in public dotfiles)
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
export PATH=$PATH:/usr/local/go/bin

#THIS MUST BE AT THE END OF THE FILE FOR SDKMAN TO WORK!!!
export SDKMAN_DIR="$HOME/.sdkman"
[[ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]] && source "$HOME/.sdkman/bin/sdkman-init.sh"
