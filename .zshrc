# zshrc config file
# BEGIN ANSIBLE MANAGED BLOCK
# Load homebrew shell variables
eval "$(/opt/homebrew/bin/brew shellenv)"

# Force certain more-secure behaviours from homebrew
export HOMEBREW_NO_INSECURE_REDIRECT=1
export HOMEBREW_CASK_OPTS=--require-sha
export HOMEBREW_DIR=/opt/homebrew
export HOMEBREW_BIN=/opt/homebrew/bin

# Load python shims
eval "$(pyenv init -)"

# Load ruby shims
eval "$(rbenv init -)"

# Prefer GNU binaries to Macintosh binaries.
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"

# Point GOPATH to our go sources
export GOPATH="$HOME/go"

# Add binaries that are go install-ed to PATH
export PATH="$GOPATH/bin:$PATH"

# Go 1.16+ sets GO111MODULE to off by default with the intention to
# remove it in Go 1.18, which breaks projects using the dep tool.
# https://blog.golang.org/go116-module-changes
export GO111MODULE=auto
# Configure Go to pull go.ddbuild.io packages.



if command -v pyenv 1>/dev/null 2>&1; then
  eval "$(pyenv init -)"
fi

export PATH="/usr/local/bin:${PATH}"

# for binutils
export PATH="/usr/local/opt/binutils/bin:$PATH"
export LDFLAGS="-L/usr/local/opt/binutils/lib"

alias k="kubectl"
alias g="git"
export EDITOR="emacs"

alias idea="open -na 'IntelliJ IDEA' --args '@0'"

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

# mac-specific stuff
# ----------------
#
preview() {
  # "$@" gives list of all arguments
  for file in "$@"
  do
    qlmanage -p "$file" &
  done
}

# Add RVM to PATH for scripting. Make sure this is the last PATH variable change.
export PATH="$PATH:$HOME/.rvm/bin"
export PATH="$PATH:/usr/local/bin"

# add DOOM to path
export PATH="$PATH:$HOME/.emacs.d/bin"

#eval "$(nodenv init -)"

source <(fzf --zsh)
eval "$(rbenv init - zsh)"

echo 'export PATH="/Applications/Sublime Text.app/Contents/SharedSupport/bin:$PATH"' >> ~/.zprofile

# Created by `pipx` on 2025-09-15 08:19:39
export PATH="$PATH:/Users/peter.griggs/.local/bin"

export ANTHROPIC_API_KEY=$(security find-generic-password -a "$USER" -s "ANTHROPIC_API_KEY" -w)

# Load local/private overrides (not in public dotfiles)
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local
