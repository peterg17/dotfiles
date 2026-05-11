#!/usr/bin/env python3
"""
Merge a pi settings override file into ~/.pi/agent/settings.json.

Usage: python3 merge-settings.py <override-settings.json> [target-path]

Keys in the override are deep-merged into the base settings, so existing
keys (state pi writes itself, e.g. lastChangelogVersion) are preserved.
"""

import json
import os
import shutil
import sys


LEGACY_SKILL_PATHS_TO_REMOVE = {"~/.claude/skills"}


def normalized_path(value):
    return os.path.normpath(os.path.expanduser(os.path.expandvars(value)))


def prune_legacy_skill_paths(settings):
    skills = settings.get("skills")
    if not isinstance(skills, list):
        return settings

    legacy = {normalized_path(path) for path in LEGACY_SKILL_PATHS_TO_REMOVE}
    filtered = [
        skill
        for skill in skills
        if not (isinstance(skill, str) and normalized_path(skill) in legacy)
    ]
    if filtered:
        settings["skills"] = filtered
    else:
        settings.pop("skills", None)
    return settings


def deep_merge(base, override):
    result = base.copy()
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def main():
    if len(sys.argv) not in (2, 3):
        print(f"Usage: {sys.argv[0]} <override-settings.json> [target-path]", file=sys.stderr)
        sys.exit(1)

    override_path = sys.argv[1]
    base_path = os.path.expanduser(
        sys.argv[2] if len(sys.argv) == 3 else "~/.pi/agent/settings.json"
    )

    if not os.path.exists(base_path):
        os.makedirs(os.path.dirname(base_path), exist_ok=True)
        shutil.copy(override_path, base_path)
        print(f"Created {base_path} from {override_path}")
        return

    with open(base_path) as f:
        base = json.load(f)

    with open(override_path) as f:
        override = json.load(f)

    base = prune_legacy_skill_paths(base)
    merged = deep_merge(base, override)

    with open(base_path, "w") as f:
        json.dump(merged, f, indent=2)
        f.write("\n")

    print(f"Merged {override_path} into {base_path}")


if __name__ == "__main__":
    main()
