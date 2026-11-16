# Lead-form automatic replies

Off by default, configured per existing lead form. No campaign or recipient is seeded by the migration.

A successful public submission records the checkbox consent in the existing submission and reserves one
`lead_form_email_deliveries` row per form and normalised address. The database unique index decides the race.
`SendLeadFormAutoReply` runs after the response. The minute command `php artisan lead-forms:send-pending` recovers
unattempted reservations if a request stops; it uses the shared campaign hourly budget. The conditional
pending → attempted update is the only way to the transport. A failed or interrupted SMTP attempt is never retried
automatically because its outcome can be unknown. Inspect the delivery counts and logs before an operator arranges a resend.

The saved subject/body and consent label are snapshots. Delivery rechecks form activation, configured expiry,
the captured expiry, tenant opt-out and provider suppression. Expiry is an ISO timestamp with an explicit offset,
not the browser's timezone. Configured campaign forms return 410 after expiry; other forms keep their current behaviour.

## Configuration

Read `GET /api/v1/admin/lead-forms/{leadForm}/auto-reply`. Write the same path with PUT (manager-only, AccessMap
product CRM). The ordinary staff form-design endpoint cannot change or remove the mail configuration.

```json
{
  "enabled": true,
  "template_id": 123,
  "consent_field": "custom:newsletter-consent",
  "expires_at": "2026-11-23T00:00:00+02:00",
  "send_existing": false
}
```

The template must be active and owned by this organisation and the form's brand (the default brand for a legacy
unbranded form). Email and the chosen consent checkbox must be enabled and required. Use absolute uploaded HTTPS
images; CID images are refused. Include a link with `href="{{UNSUBSCRIBE_URL}}"`; no member tags or other merge tags
are accepted. A form subscriber is never rendered against an unrelated loyalty member.

`send_existing: true` explicitly reserves replies for this form's successfully processed, consented submissions only;
it does not email a guest database or reset earlier deliveries. Do a controlled test first. Counts in the response
are database delivery states, not proof of inbox arrival. The full admin UI does not yet expose these advanced mail
settings; the authenticated manager API is the operator interface for this release.

Every message has the existing `MailIdentityService` identity, HTML/plain-text parts and one-click unsubscribe headers.
The permanent token link uses `/api/v1/public/lead-form-mail/unsubscribe/{token}`. It records an organisation-scoped
marketing opt-out and switches off matching loyalty members' marketing channel. It does not suppress booking or
password-reset mail. Delivery records and their unsubscribe links survive deleting the form. Hard-bounce/complaint
suppression remains the shared `EmailSuppression` service. Never log addresses or tokens while diagnosing this feature.

## Checks

Use PHP 8.5, test-only database environment variables, and scoped commands:

```text
php artisan view:clear
php artisan test tests/Feature/LeadForm/
php artisan test tests/Feature/AdminAccess/
```

Tests use an in-memory SQLite schema and the actual Laravel array mail transport; a failing transport tests unknown
SMTP outcomes. They cover the real successful submit/after-response path, deduplication, consent refusal, expiry,
template ownership/tags, context restoration, one-click opt-out and transactional-mail separation. Before activation,
verify a controlled live inbox, delivery counts, the public iframe and a repeated submission. A zero-error API response
alone is not a mail-delivery test.
