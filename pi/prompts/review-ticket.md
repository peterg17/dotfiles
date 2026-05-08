---
description: Review and validate the current diff against a Jira ticket
argument-hint: "<JIRA-KEY-or-request>"
---
Use the `ticket-workflow` skill in review/validation mode for the current diff.

Ticket / request:
$ARGUMENTS

Fetch/read the Jira ticket if needed, inspect the current repo diff, then run `ticket-reviewer` and `ticket-validator`. Report APPROVED/CHANGES REQUESTED and VALIDATED/NOT VALIDATED with actionable details. Do not edit files.
