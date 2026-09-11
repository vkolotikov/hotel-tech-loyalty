# SEO chatbot reporting

`GET /api/v1/reports/business-outcomes` accepts a separate hashed reporting key, not a
staff or integration write token. The key is pinned to one organization. Create/rotate
it with authenticated `POST /api/v1/admin/business-reporting-key`; analytics permission
is required. Other app APIs do not recognize this key.

The export contains timestamps and owned-site project labels only: visitor messages,
first visitor message per conversation, and one saved inquiry record per chat lead.
AI greetings/replies, staff replies, unowned hosts and other organizations are excluded.
Builder-synchronized inquiries are excluded to avoid counting the same lead twice.
Queries explicitly bind both sides of joins to the token's organization.

No chat content, contact identity, URLs, visitor IDs or ad attribution is exported.
The SEO platform polls every five minutes. Messages are interactions; a saved inquiry
is an enquiry, never proof of a paid sale. The export is capped and marks truncation;
the consumer must reject incomplete replacements.

Tests cover organization isolation, mismatched foreign keys, lead deduplication,
auto-response exclusion, old conversations with new replies, exact host routing, and
separate read-only authentication. This release changes no widget or staff interface.
