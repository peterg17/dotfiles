# zshrc config file


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

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
eval "$(rbenv init - zsh)"

echo 'export PATH="/Applications/Sublime Text.app/Contents/SharedSupport/bin:$PATH"' >> ~/.zprofile

