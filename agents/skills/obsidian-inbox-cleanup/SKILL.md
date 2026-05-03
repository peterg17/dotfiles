---
name: obsidian-inbox-cleanup
description: Process this Obsidian vault's Index.md capture inbox. Use when asked to file captured links, notes, ideas, and tasks into the organized vault, create resource/project/learning notes when useful, add tags/frontmatter/related links, update MOCs, and clear or archive processed Index items.
---

# Obsidian Inbox Cleanup

Use this skill in `/Users/peterg17/Documents/notes` to process `Index.md` captures into the Obsidian vault.

## Operating principles

- Follow `AGENTS.md` first, especially privacy/safety rules.
- Treat `Index.md` as a capture inbox, not a durable note.
- Preserve user intent and original URLs.
- Prefer small, additive changes: append to existing notes/MOCs before creating many new notes.
- Do not delete ambiguous captures. Leave them in `Index.md` under `## Needs review` with a short reason.
- Do not expose sensitive personal details in chat/log output.

## Vault destinations

- Learning notes: `03 Learning/Systems/`, `03 Learning/ML/`, `03 Learning/Databases/`, `03 Learning/Tools/`
- Projects: `01 Projects/`
- Areas: `02 Areas/`
- Resources: `04 Resources/`
- Archive: `05 Archive/`
- Maps of content: `00 Maps/`

## Processing workflow

1. Read `AGENTS.md`, `Index.md`, and relevant MOCs in `00 Maps/`.
2. Identify unprocessed captures under `## Inbox` or unchecked list items.
3. For each capture, decide one action:
   - append to an existing note,
   - create a new note with frontmatter,
   - add to a MOC/resource list,
   - convert to a task in `02 Areas/Personal/Tasks.md`,
   - leave under `## Needs review` if ambiguous or sensitive.
4. For links:
   - preserve the original URL,
   - add a one-line summary if obvious from surrounding text/title,
   - tag as `resource/article`, `resource/paper`, `resource/tool`, or `resource/link-list` when creating a note.
5. For ideas:
   - append to `01 Projects/Side project ideas.md` or create/update a project note.
6. For learning notes:
   - add `type: learning`, topical tags, and a short `## Related` section when creating or substantially editing.
7. Update relevant MOCs in `00 Maps/` if a new durable note is created.
8. Remove processed items from `Index.md` or move uncertain items to `## Needs review`.
9. Run unresolved-link checks:
   - `obsidian unresolved total` if the CLI is available,
   - otherwise scan wikilinks manually or with a short script.
10. Report a concise summary of files changed and any items left for review.

## Preferred Index.md structure after cleanup

Keep `Index.md` with this shape:

```md
# Index

... instructions ...

## Inbox

## Needs review

- [ ] item that needs human choice
```

If no items remain, leave `## Inbox` empty.
