# Handoff — 20 November 2026

## SaaS company sign-in to Loyalty

A platform operator selected a company in SaaS and clicked Loyalty App. Loyalty showed “Authentication required.” The subsequent password sign-in opened the operator's usual company.

SaaS signs the selected company into the handoff token. Laravel had sorted the Sanctum check ahead of the middleware that reads that token, so the request failed before Loyalty could resolve the company. The bootstrap now runs SaaS authentication before Sanctum and resolves the tenant before route-model binding.

The API regression signs in with a test token for one of two companies that share a staff email. It checks that the route returns that company's local staff account and role. The test reproduced the 401 before the fix and passed after it.

To verify in production, select the intended company in SaaS and use **Apps → Loyalty App**. Verify the company before editing a member or programme settings. The [13 November handoff](2026-11-13-hexatech-handoff.md) records the preceding Content audit.
