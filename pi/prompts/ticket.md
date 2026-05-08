---
description: Run the end-to-end teammate workflow for one Jira ticket or task
argument-hint: "<JIRA-KEY-or-request>"
---
Use the `ticket-workflow` skill to work this single ticket end-to-end.

Ticket / request:
$ARGUMENTS

Default behavior:
- Fetch/read the Jira ticket first.
- Run the teammate planning chain (`ticket-jira-analyst` → `ticket-scout` → `ticket-planner`).
- If clarification is required, ask before editing.
- Otherwise summarize the plan and ask for confirmation before code edits unless I explicitly said to proceed autonomously.
- After implementation, run reviewer, tester, and validator gates.
- Do not commit/push/PR unless I explicitly ask.
