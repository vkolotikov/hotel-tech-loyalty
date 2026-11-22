# Handoff — 22 November 2026

## CRM WhatsApp and AI Discovery

The FDS Cards Contacts DB production check found an active webhook verification and zero connected accounts,
threads, messages or receipts. The CRM shows this connection's status in **Integrations → Channels** and reads
trusted WhatsApp history from Contacts DB in lead and contact records. Meta Embedded Signup still needs to connect
the business number. The bridge uses the existing FDS Cards service credential and reads matched history only.

**AI Discovery** is available from a lead or contact. It researches a public company, keeps source links on each
finding, and saves fields when staff apply them. Proposal drafts use the reviewed company profile and current lead
request. The CRM can export the saved profile as structured JSON for the customer portal. See the [CRM runbook](../crm-workspace.md#whatsapp-history-and-ai-discovery).

The OpenAI Responses API returned 12 sourced fields in a live research request using HexaTech's public website.
Business profile saves, exports and WhatsApp message display were exercised in Chrome at desktop and mobile widths.
