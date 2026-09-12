# Business source reporting

The organization-scoped business outcome feed now adds `source_channel` to saved chat enquiries.
Only explicit known campaign parameters from an owned conversation entry URL are classified,
once at conversation creation. The existing page_url changes on resume, so it cannot be used
to reconstruct historical acquisition. Two nullable columns retain the original channel and
site enum. Existing conversations remain unknown. Resuming never overwrites this snapshot.
No URL, visitor identity, message body, click identifier or arbitrary campaign string leaves
the source application. Missing evidence stays unknown. `fbclid` alone does not distinguish
paid Facebook traffic from organic social traffic.

Evidence from messages after inquiry creation is excluded. Multiple conflicting known entries
for an inquiry are rejected. Existing cross-tenant predicates, saved-inquiry deduplication and
exclusion of imported builder enquiries remain in force. This is entry evidence, not a claim
that advertising caused the enquiry. No marketing event is replayed.

## Campaign journeys added 12 September

The widget now retains a consented, same-site list of observed acquisition touches at page
load, before a visitor navigates to the page where they open chat. Only portfolio hosts use
this collection, and it requires the site's existing Analytics consent. Browser storage is
limited to 30 days and 12 touches, preserving the first and latest when truncated. A missing
referrer remains unknown; a Facebook click ID alone remains organic social evidence.

The current context accompanies init, messages and explicit lead submission. Existing-session
page views can also update it. Server capture uses the explicit chat session and organization;
it never joins a marketing journey through a visitor fingerprint, email or phone number.
New `marketing_attribution` JSON is nullable. Migration
`2026_09_12_160000_capture_consented_chat_touches.php` must run with deployment.

Saved enquiries freeze their touch context. Later navigation cannot claim the earlier lead;
Analytics consent withdrawal removes stored context on the next widget request. Old clients
that omit consent metadata do not erase the snapshot. Original entry fields remain unchanged.
When entry site is known, mutable page_url cannot move a historical conversation to another
country's reporting. Existing conversations without an immutable entry remain limited.

The additive feed contract on saved `chat_lead` rows is:

```json
{"attribution":{"version":1,"touches":[{"channel":"meta","campaign_id":"12345","observed_at":"2026-09-12T09:00:00+00:00","evidence":"utm"}],"truncated":false}}
```

Campaign IDs come only from `utm_id` or `campaign_id` and permit 1–100 ASCII letters,
numbers, underscore or hyphen, beginning with a letter or number. Campaign names, private
URL queries, raw referrers, click identifiers, visitor identities and messages are excluded.
Reporting sanitizes again and excludes touches after enquiry creation. Legacy `source_channel`
uses the latest known touch when present; it is not a causal credit calculation. Campaign
labels must be resolved from the connected provider's campaign inventory.

Validation: 12 scoped PHP tests / 63 assertions cover consent, chronology, immutable enquiry
snapshots, cross-site rejection, organization isolation, sanitization, bounded histories and
widget init/memory and the human-handoff message path. `node scripts/test-widget-attribution.cjs` checks landing-to-chat continuity,
Meta/Google sequences, referrer classification, revocation and cap behavior. The existing
14-host confirmed-lead Analytics script test also passes. No live enquiry was submitted.

Unchanged limitations: older unknown journeys cannot be reconstructed from mutable URLs.
Cross-device journeys are not inferred. Explicit form submission creates a new CRM inquiry
and links the conversation; broader lead deduplication is outside this attribution patch.
