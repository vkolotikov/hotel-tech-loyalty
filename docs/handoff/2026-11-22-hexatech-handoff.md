# Handoff — 22 November 2026

## CRM business profile setup

**Settings → Our business** now has five steps from Sources through Review. Managers can enter details manually or
review suggestions from the company website, public search and uploaded documents. One-click blank filling preserves
existing values. References from accepted suggestions remain on saved profile fields. See the
[business profile runbook](../crm-workspace.md#business-profile-setup).

## Forrest Glamp Smoobu connection

The production organisation named **Forrest Glamp** has 15 mapped rooms. On 22 November, both the apartments and reservations endpoints returned 401 with its saved organisation key. Its signing secret was empty and neither brand had a credential override. The last successful scheduled import and first subsequent 401 were five minutes apart on 17 November, the date Smoobu retired key-only access. The venue owner will need access to the main Smoobu account to supply the matching key and secret. Live recovery requires a successful room and reservation sync after they are saved.

The admin sync and connection test now identify a missing signing secret or a rejected signed request. Bookings and Settings display failed and partial syncs as errors. See the [credential setup and recovery instructions](../booking-promotions.md#smoobu-credentials).

## CRM lead AI assistant

Leads have an **AI assistant** for briefs, sales and marketing plans, proposals and response emails. Staff can
save either strategy after review and use it in later drafts. **Settings → Our business** holds each brand's
business profile. It reuses the brand's available Content Planner information and supports CRM-only teams.
The assistant uses reviewed customer discovery fields and recent conversation history, including matched
FDS email or WhatsApp messages when available. Results show which sources were used. See the
[CRM assistant runbook](../crm-workspace.md#lead-ai-assistant-and-our-business).

## CRM WhatsApp and AI Discovery

The FDS Cards Contacts DB production check found an active webhook verification and zero connected accounts,
threads, messages or receipts. The CRM shows this connection's status in **Integrations → Channels** and reads
trusted WhatsApp history from Contacts DB in lead and contact records. Coexistence is disabled in the live Contacts DB
settings. Enable it after Meta approval, then complete Embedded Signup to provision the messaging account and phone
number IDs. The bridge uses the existing FDS Cards service credential and reads matched history only.

**AI Discovery** is available from a lead or contact. It researches a public company, keeps source links on each
finding, and saves fields when staff apply them. Proposal drafts use the reviewed company profile and current lead
request. The CRM can export the saved profile as structured JSON for the customer portal. See the [CRM runbook](../crm-workspace.md#whatsapp-history-and-ai-discovery).

The OpenAI Responses API returned 12 sourced fields in a live research request using HexaTech's public website.
Business profile saves, exports and WhatsApp message display were exercised in Chrome at desktop and mobile widths.
The Contacts DB production release `d31165a` returned `setup_required` with zero messages from the authenticated bridge.
