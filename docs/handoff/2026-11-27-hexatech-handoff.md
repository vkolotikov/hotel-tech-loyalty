# Handoff — 27 November 2026

## CRM team dashboard

The [team dashboard](../crm-workspace.md#team-dashboard) at `/crm/team` includes a signed-in TV view, venue-local weekly and monthly lead and win counts, current unanswered threads and an actionable priority queue. Win dates now also follow individual and bulk lead status edits. The screen uses existing correspondence and background AI review. No database migration is required.

## Open lead value

Leads, Today and Insights use a shared open-pipeline valuation. FDS Cards reports in EUR. Other brands use their
venue currency. Original amounts and the dated ECB rates are available in the breakdown. Open values with missing
currencies have a review link. Missing rates and missing currencies are excluded from the displayed amount.
The [CRM runbook](../crm-workspace.md#lead-navigation-and-fds-cards-pricing) describes how to correct a lead.

## CRM email generation

The Lleggo case exposed a saved commercial hold with an empty body after the earlier reviewer required verbatim passages. The email writer now retrieves multiple topics locally and drafts in one provider request on the normal path. Manager Focus and revision comments can authorise current opportunity terms. Existing contact, scope and quote checks still apply. A failed targeted correction preserves safe wording. The lead screen offers fresh generation for earlier empty commercial holds.

The lead assistant and full admin proposal composer use the same rules. Detailed source matches remain in the saved trace. Staff see the draft, up to three optional recommendations and a collapsed list of sources. The CRM stores managerial guidance with the scoped draft. Transient full-admin revision handles bind guidance to its current contact, opportunity, brand and quote.

Regression coverage includes manager and staff permissions, partial pricing, unresolved supplier terms, a provider failure during correction, stale commercial holds, failed revisions, reseller retrieval, brand isolation and the two proposal entry points. See the [CRM email runbook](../crm-workspace.md#customer-email-drafts) and the [26 November handoff](2026-11-26-hexatech-handoff.md) for existing integrations and release context.
