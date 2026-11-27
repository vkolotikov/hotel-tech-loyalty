# Handoff — 27 November 2026

## CRM sales workflows

The [sales workflow audit](../crm-sales-audit-2026-11-27.md) covers Leads, Deals and Contacts. The deal list and its export share the same query. Deal summary cards use reporting-currency valuations and open their matching lists. The staff CRM also has mobile follow-up and fulfilment selectors, contact shortcuts, and keyboard focus management for record and form panels.

## Lead list

The Leads table shows the date each lead entered the CRM in the venue’s time zone. Select a column heading to order the filtered list, then select it again to reverse the order. On phones, the date appears on the card and the Sort menu controls the order.

## CRM team dashboard

The [team dashboard](../crm-workspace.md#team-dashboard) at `/crm/team` includes a signed-in TV view, venue-local weekly and monthly lead and win counts, current unanswered threads and an actionable priority queue. Win dates now also follow individual and bulk lead status edits. The screen uses existing correspondence and background AI review. No database migration is required.

The dashboard now opens on a performance overview. It shares the CRM currency valuation, compares week or month activity, and groups lead countries across the selected period or all time. Due and overdue follow-ups count independently of the email queue. The TV rotates through Customers, every page of the shared day plan, the priority queue and Overview. Staff can pause rotation, and it respects reduced-motion preferences. Bookmarks with an action filter still open the queue.

The **Day plan** tab adds and shares real dated assignments. It combines the existing Time Planner with brand-visible CRM work, honours own-day planning permissions and refreshes across signed-in displays every minute. Its slide shows local daily and weekly lead growth, wins, unanswered threads, priority leads, priority work and employee progress. Staff can plan future dates from their working view.

The **Customers** tab at `/crm/team?view=customers` ranks visible customers by converted won deal value and shows priority leads beside overdue conversations in each direction. A seven-day wait uses the actual last email on its thread. Staff can open the matched contact, company, lead or message. A fresh TV link starts here. The customer-period control lets staff look back across all recorded wins while the live queue continues across reporting periods.

## Open lead value

Leads, Today and Insights use a shared open-pipeline valuation. FDS Cards reports in EUR. Other brands use their
venue currency. Original amounts and the dated ECB rates are available in the breakdown. Open values with missing
currencies have a review link. Missing rates and missing currencies are excluded from the displayed amount.
The [CRM runbook](../crm-workspace.md#lead-navigation-and-fds-cards-pricing) describes how to correct a lead.

## CRM email generation

The Lleggo case exposed a saved commercial hold with an empty body after the earlier reviewer required verbatim passages. The email writer now retrieves multiple topics locally and drafts in one provider request on the normal path. Manager Focus and revision comments can authorise current opportunity terms. Existing contact, scope and quote checks still apply. A failed targeted correction preserves safe wording. The lead screen offers fresh generation for earlier empty commercial holds.

The lead assistant and full admin proposal composer use the same rules. Detailed source matches remain in the saved trace. Staff see the draft, up to three optional recommendations and a collapsed list of sources. The CRM stores managerial guidance with the scoped draft. Transient full-admin revision handles bind guidance to its current contact, opportunity, brand and quote.

Regression coverage includes manager and staff permissions, partial pricing, unresolved supplier terms, a provider failure during correction, stale commercial holds, failed revisions, reseller retrieval, brand isolation and the two proposal entry points. See the [CRM email runbook](../crm-workspace.md#customer-email-drafts) and the [26 November handoff](2026-11-26-hexatech-handoff.md) for existing integrations and release context.
