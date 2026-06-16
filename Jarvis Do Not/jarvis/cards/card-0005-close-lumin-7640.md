---
id: card-0005
title: Close out Lumin PDF reminders for 7640 South St JV agreement
seat: janitor
tier: 1
status: review
created: 2026-06-15
entity: lincoln-7640
why: JV agreement was signed and confirmed by Lumin on 6/14 ("approved and signed"). But Lumin kept firing reminder emails before that, and they're still cluttering the inbox under unread. Pure hygiene — one tier-1 cleanup card that gets the operator practice writing real `result` lines.
action: |
  Search Gmail for `from:noreply@luminpdf.com subject:7640` — mark the resolved-signed thread (19ec79d195c9b12a) as read + archive the two reminder threads (19ec5e624b390893, 19ebe396e77ab524). Apply label `10. Documents/Added into Drive` if not already there. Tier-1: execute on pickup, no draft required.
result: BLOCKED on Gmail re-auth. The Gmail MCP token is granted read + draft scope but not label/archive write scope — every unlabel_thread and label_thread call returns 403 "tried upscoping." Kevin needs to revoke + reconnect the Gmail MCP and grant the modify scope. Three threads still need: archive 19ec5e624b390893 and 19ebe396e77ab524 (Lumin reminders), and mark-read + apply "10. Documents/Added into Drive" to 19ec79d195c9b12a (the signed JV).
---
