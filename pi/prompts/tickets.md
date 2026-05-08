---
description: Run the teammate workflow for multiple independent Jira tickets
argument-hint: "<JIRA-KEY...>"
---
Use the `ticket-workflow` skill to tackle these tickets as a parallel batch.

Tickets / request:
$ARGUMENTS

Default behavior:
- Support 2-5 independent tickets only; ask me to batch if there are more.
- Fetch/read all Jira tickets first.
- Check repo cleanliness and determine base branch/worktree root/branch prefix.
- Create one git worktree per ticket before implementation.
- Run each ticket through planning, implementation, reviewer, tester, validator gates.
- Do not commit/push/PR unless I explicitly ask.
