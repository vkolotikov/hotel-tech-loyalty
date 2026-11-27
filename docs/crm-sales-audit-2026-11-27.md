# CRM sales workflow audit

27 November 2026 · Leads, Deals, and Contacts in the staff CRM.

| Workflow | What staff encountered | Change |
| --- | --- | --- |
| Find a person or enquiry | A mobile-only contact could disappear from search. Deals missed searches by phone or email. | All three lists match names, companies, email addresses and phone numbers. A number can be pasted with or without spaces, brackets or hyphens. |
| Work through a lead queue | Typing and immediately changing a filter could undo the filter. “Due now” exported every open lead. The combined view could stop at 100 rows per section. | Search keeps the latest filter. Exports use the selected dates, filters and order, including overdue and today in the venue’s time zone. Large due sections link to their complete paginated lists. |
| Check a deal figure | Several summary cards gave a count without a way to see the deals behind it. Amounts in different currencies could be added together under a single currency symbol. | Each card opens its underlying records. Priced deals use the CRM reporting currency, with an approximation sign for conversions and a count of amounts excluded. The unpaid card shows the recorded value of those deals. The individual record shows its balance. |
| Track fulfilment or export deals | Review and Completed were missing from the quick filters. The downloaded file could ignore the selected stage, payment status and sort, or omit older won deals. | All six stages are selectable. CSV and Excel use the same deal query as the list across every page. Payment and fulfilment actions apply to deals recognised by the pipeline. |
| Find and contact a person | Switching between People and Companies discarded the previous search. A mobile number or email address required opening the record on a phone. | Each tab remembers its filters and page during the visit. People can be sorted by name in either direction. Email and call actions sit on the row when usable contact details exist. |
| Navigate a record or a form | Tab could move behind an open record. A validation problem could be off-screen. | Tab stays inside the active panel. Escape dismisses the current menu or dialog first. Closing the record returns focus to its opener when available. New lead, deal, contact and company forms focus the first invalid field. |
| Use a small screen or change pages | Some filter choices were off-screen. Earlier results could remain selectable as a new page loaded. A bookmarked page beyond the final page could appear empty. | Labeled mobile selectors expose every follow-up or stage. Search and create controls name their scope. Lists show their loading state and recover to the final available page while retaining filters. |

## Verification

Browser checks used the actual staff CRM with synthetic records. They covered keyboard-only record navigation, nested confirmations, invalid form submissions, simultaneous search and filter changes, tab switching, brand switching, mobile contact links and out-of-range pages. Core screens were inspected at 320, 390 and 1440 pixels. All five CRM languages were checked at 320 pixels, across light and dark themes.

The API checks exercised search, exports, venue-local date boundaries, legacy won records, partial payments, reopening completed deals, currency conversion coverage, and brand and staff permissions. The CRM suite runs against SQLite and an independently migrated PostgreSQL database. Customer communication and existing customer records were kept out of write tests.

## Coverage boundaries

Individual deal rows retain the currency in which the amount was recorded. Currency summaries depend on recorded amounts and available exchange rates. The audit covered the staff CRM and its shared sales endpoints. Browser checks used Chromium with responsive viewports. Physical-device testing and observation of staff completing tasks were outside this review.
