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
