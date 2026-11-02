# FDS Cards Contacts feed — 2 November 2026

This task added the approved read-only connection from HexaTech's FDS Cards brand to
https://contacts.hexa-tech.uk. Other application work remains described in the 31 October handoff.

## Release and configuration

- Feature worktree: `E:/Hexa-Tech-contacts-20261102`, branch `feature/contacts-feed-20261102`.
- Feature code tips: `6bf3e90b6`, then `db0051acf` (exclude empty website sessions).
- Separate release worktree: `E:/Hexa-Tech-contacts-deploy-20261102`; source parity checked.
- Production code: `f2191c5eb`, after source release `9ec213b29` and fresh SPA build `8a0547554`.
- Cloud environment: `hotel-tech-loyalty / main`. Configuration deployment **1115/f2191c5** succeeded.
- Endpoint: `GET /api/v1/integrations/contacts-feed`. No write method; dedicated bearer; rate-limited.
- Cloud sets `CONTACTS_FEED_BRAND_ID=23` and `CONTACTS_FEED_TOKEN_HASH`. The token itself belongs only
  in the receiving Contacts application's private configuration. Never print or commit either app's secrets.
- FDS Cards is brand 23, organisation 19. Request parameters cannot select another brand or organisation.
- Contacts configuration deployment **14/01b9bbb** succeeded, with `CONTACT_CRM_FEED_URL`,
  `CONTACT_CRM_ACCOUNT_ID=hexatech:brand:23`, and `CONTACT_CRM_READ_TOKEN`.
- Existing custom environment values were preserved exactly when appending the new settings.
- Owner approved the new ongoing read-only access in this session. No additional hosting was provisioned.

## Export boundaries

Customers are organisation-level records. Exported profiles require an FDS Cards enquiry, visitor,
task or activity link. This intentionally excludes customers without a confirmed FDS Cards attribution;
the organisation has 203 customer rows, of which 162 qualified during this import.

The cursor advances through profiles, enquiries, activity, tasks, conversations, messages and attachment
metadata. Pages are bounded at 100 rows, cursors are encrypted and bound to the brand and organisation,
and related customer IDs are resolved in batches. Conversation messages are not marked read.

Empty anonymous website sessions are excluded. Conversations are retained if they have messages from
visitors/agents/AI, a lead, a linked customer visitor or internal agent notes. System/tool messages,
credentials, passport/identity documents, telemetry, attachment binaries and un-attributed shared customer
notes are not exported. Enquiry notes and requirements are included. Attachment metadata never fetches files.
Missing source rows do not delete anything in Contacts. The source application is not written to.

## Verification

- Release artifact: 97 backend tests / 5,039 assertions passed for Integration, TenantScope,
  ApiAuthentication and AdminAccess. The later empty-session change passed 4 tests / 62 assertions
  on both feature and release worktrees. Larastan reports no errors for the new classes.
- TypeScript, all 5,790 frontend tests in 399 files, and production SPA build passed.
- Pinned compatible local runtime: `E:/FDS-Contact-Platform/tools/php85/php.exe` (8.5.12).
  WAMP's documented 8.5 folder is absent. Use `-d opcache.enable_cli=0 -d extension=gd` for this
  worktree: CLI OPcache produced a spurious RecursiveIterator error while disabled OPcache passed.
  Dependencies were installed from the existing lockfile in a real vendor copy, never a junction.
- Production endpoint returned its own `Feed authentication required` response without credentials.
- Contacts first live sync finished **2026-11-02 09:20:54 UTC**, 63 pages, 6,092 received records,
  no error. That is 162 staged contact changes plus 5,930 encrypted source-history records:
  162 profiles, 169 enquiries, 93 tasks, 660 conversations, 4,846 messages.
- Contacts tests: 25 tests / 287 assertions before the encryption follow-up; the encryption follow-up
  passed 3 tests / 22 assertions. Vue type-check and build passed. Live CRM records UI loads the data.
- Contacts still has 3,718 active contacts. No incoming contact changes were applied.
  23 source profiles have one exact email match; 139 have none; none have multiple exact email matches.
- QuickBooks remains connected, with 1,344 API customer records staged. Zoho remains connected with
  64 saved messages. No emails were sent.

## Next operational steps

Review the 23 suggested matches and the 139 unmatched CRM profiles before applying contact changes.
Check the local archive as well when identifying unmatched customers. CRM history appears in a contact's
CRM history tab once its source record is linked through review; all fetched history is immediately available
under Integrations → CRM records. Refreshes currently run through Fetch contacts; no periodic schedule was
enabled by this task. Shared/un-attributed customers require an explicit attribution decision.
