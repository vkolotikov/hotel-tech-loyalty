# Email deliverability — current posture and roadmap

**Last verified:** 2026-08-14 (DNS records checked live; sending path read from code)

This document exists so sales answers about deliverability are accurate. Where
something is not yet true, it says so.

---

## Short answer for a prospect

> Campaigns send over authenticated SMTP with SPF and DKIM published and
> alignment passing, and we implement RFC 8058 one-click unsubscribe, per-member
> consent scoping and unsubscribe footers — the requirements Gmail and Yahoo
> place on bulk senders.
>
> Today all tenants send from a shared platform domain and a shared IP. Per-
> tenant authenticated sending domains and a dedicated IP are on the roadmap and
> are what we would put in place for a customer sending at volume.

Do **not** claim: dedicated IP, per-customer sending domain, or DMARC
enforcement. Those are not in place.

Bounce/complaint processing and a suppression list ARE built and enforced, but
they receive nothing until SES is live — so describe them as "in place, pending
provider cutover" rather than as operating today.

---

## What is true today

### Authentication (verified in DNS, 2026-08-14)

Sending domain is **`hotel-tech.ai`** — the `From` on every campaign is
`noreply@hotel-tech.ai`.

| Record | Status |
|---|---|
| **SPF** | ✅ `v=spf1 +a +mx include:hotel-tech.ai.spf.auto.dnssmarthost.net ~all` |
| **DKIM** | ✅ `default._domainkey` published (1024-bit RSA) |
| **DMARC** | ⚠️ `v=DMARC1; p=none; aspf=r; adkim=r;` — **monitoring only, and no `rua`, so no reports are collected anywhere** |

**Alignment passes.** The `From` domain, the SPF domain and the DKIM `d=` are
all `hotel-tech.ai`, so both SPF and DKIM align under relaxed policy. This is a
genuine, checkable strength.

### Compliance (in code)

- ✅ **RFC 8058 one-click unsubscribe** — `List-Unsubscribe` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (`EmailComplianceService::applyHeaders`). This is a hard requirement for bulk
  senders to Gmail and Yahoo.
- ✅ **Unsubscribe footer** on every marketing send.
- ✅ **Consent scoping** — recipients are filtered by category and consent state
  before send (`scopeEligible`); transactional and marketing are separated.
- ✅ **Open tracking** (`CampaignTrackingController`).
- ✅ **Per-venue sender name and Reply-To** — campaigns AND all guest-facing mail
  (booking confirmations, refunds, welcome, membership) send under the venue's
  name, with replies routed to the venue's own address.
- ✅ **Suppression list, enforced at the transport.** A `MessageSending` listener
  cancels any send to a suppressed address. This is deliberately not a query
  filter: only 1 of ~26 send sites consulted the compliance service, so a filter
  could be bypassed by any new call site. Hard bounces and complaints suppress
  platform-wide; unsubscribes are scoped to one tenant.
- ✅ **SES bounce/complaint webhook** at `POST /api/v1/webhooks/ses`, verifying
  the SNS TopicArn (and refusing unverified notifications in production).

---

## What is NOT true today — the honest gaps

### 1. Shared IP and shared domain
All tenants send from `noreply@hotel-tech.ai` via a shared hosting mail server
(`mail.hotel-tech.ai`; MX is `mailspamprotection.com`, SPF includes
`dnssmarthost.net` — i.e. shared cPanel-class hosting, not a transactional ESP).

Consequences:
- **One tenant's bad list damages every tenant.** Reputation is pooled.
- Customers cannot build sender reputation on their own domain.
- Recipients see a platform address, not the venue they know.
- No IP warm-up, no reputation isolation.

`config/mail.php` already defines `ses`, `postmark` and `mailgun` mailers — they
are configured as options but **not in use**.

### 2. DMARC is decorative
`p=none` with no `rua` means: no enforcement, and nobody receives aggregate
reports. It signals intent without doing anything. It should be at minimum
`p=none; rua=mailto:…` so failures become visible, then moved to `quarantine`
once the reports are clean.

### 3. Bounce/complaint handling exists but is not yet RECEIVING anything
The suppression list, the transport-level enforcement and the SES webhook are
built and tested. They stay inert until SES is actually sending, because that is
where bounce and complaint notifications come from. Nothing suppresses today
except manual entries.

Until SES is live, a hard bounce is still invisible and still retried.

### 4. DKIM keys are 1024-bit
Accepted everywhere, but 2048-bit is the current recommendation.

### 5. `hexa-tech.uk` publishes TWO DMARC records
```
v=DMARC1; p=none; rua=mailto:info@hexa-tech.uk; ruf=...; sp=none; adkim=r; aspf=r; pct=100
v=DMARC1; p=none; aspf=r; adkim=r;
```
Per RFC 7489, when multiple DMARC records exist at `_dmarc`, receivers **ignore
DMARC entirely**. So the marketing domain currently has *no* effective DMARC
despite appearing configured. **Delete one record** — keep the one with `rua`.

### 6. Throughput vs relay limits
Campaigns send 100 recipients per chunk. The interval is now configurable
(`MAIL_CAMPAIGN_CHUNK_SECONDS`, default 60s ⇒ ~6,000/hour). It was previously
5s ⇒ ~72,000/hour, which no shared relay will accept; exceeding the ceiling gets
mail deferred or the account throttled.

**Confirm the actual hourly limit with the host** and set the interval to match.

---

## Roadmap to "highest level"

In dependency order.

### Step 1 — Move to a transactional ESP *(the unlock for everything else)*
Amazon SES, Postmark or Mailgun. All three are already scaffolded in
`config/mail.php`; switching is an env change plus credentials.

This buys: reputation management, bounce/complaint webhooks, suppression lists,
per-domain DKIM signing, dedicated-IP options, and real delivery analytics.

### Step 2 — Bounce, complaint and suppression handling ✅ BUILT
`email_suppressions` table, `EmailSuppression` model, transport-level
enforcement via the `BlockSuppressedRecipients` listener, and
`SesWebhookController`. Hard bounces and complaints suppress permanently and
platform-wide; soft bounces only after `SOFT_BOUNCE_LIMIT` failures;
unsubscribes are scoped to one tenant.

Enforcement is on the `MessageSending` event rather than in `scopeEligible`,
because that method is called from exactly one of ~26 send sites — a query
filter would be bypassed by every other path, including all guest-facing mail.

Inert until step 1 lands: bounce data comes from the ESP.

### Step 3 — Per-tenant authenticated sending domains
Let a venue verify `mail.theirdomain.com`, publish the ESP's SPF/DKIM records,
and send as themselves. This is what makes alignment meaningful *for the
customer* and what a serious buyer is asking about.

Until then the `From` address deliberately stays on the platform domain: sending
from an unverified tenant address would break alignment and make deliverability
**worse**.

### Step 4 — Tighten DMARC
Add `rua`, watch reports, then move `p=none` → `quarantine` → `reject`.
Rotate DKIM to 2048-bit at the same time.

### Step 5 — Dedicated IP (only at volume)
Worth it above roughly 100k messages/month sustained. Below that a reputable
shared pool usually outperforms a poorly warmed dedicated IP.

---

## Immediate no-code fixes

1. **Delete the duplicate `_dmarc` TXT record on `hexa-tech.uk`** — currently
   voiding DMARC on that domain entirely.
2. **Add `rua=mailto:…` to `hotel-tech.ai`'s DMARC** so failures are visible.
3. **Confirm the SMTP relay's hourly limit** and set
   `MAIL_CAMPAIGN_CHUNK_SECONDS` accordingly.


---

## SES cutover runbook

Everything in the application is ready. These are the steps that need an AWS
console, in order.

AWS account **301556367642** (Hexa-Tech).

### 1. Region — use `eu-west-2` (London)
The console defaults to Stockholm, but the app runs in Laravel Cloud EU West.
**SES identities, the sandbox and SMTP endpoints are all per-region**, so a
mismatch silently sends from an account that verified nothing.
`config/services.php` already defaults to `eu-west-2`.

### 2. Verify the sending domain
SES → Identities → Create identity → Domain → `hotel-tech.ai`.
Publish the three DKIM CNAME records SES gives you. Wait for "Verified".

Leave **Easy DKIM** on — that is what makes SES sign as your domain and keeps
DMARC alignment intact.

### 3. Request production access — DO THIS FIRST, IT TAKES ~24h
New SES accounts are sandboxed: they can only send to addresses you have
verified, at a very low rate. SES → Account dashboard → Request production
access. Describe the use case (transactional booking/loyalty mail plus
opt-in marketing, with one-click unsubscribe and suppression already
implemented — all of which is true and helps approval).

### 4. Create SMTP credentials
SES → SMTP settings → Create SMTP credentials.

Use **SMTP, not the SDK**: `MAIL_MAILER=ses` requires `aws/aws-sdk-php`, which
is not installed. The SMTP endpoint needs no new dependency and gives identical
deliverability and bounce handling.

### 5. Create the SNS topic for bounces and complaints
1. SNS → Create topic (Standard), e.g. `hexatech-ses-feedback`.
2. Create a subscription: protocol **HTTPS**, endpoint
   `https://loyalty.hotel-tech.ai/api/v1/webhooks/ses`.
   The app auto-confirms the subscription handshake.
3. SES → your domain identity → Notifications → set **Bounce** and **Complaint**
   to that topic. (Delivery notifications are optional and noisy.)

### 6. Set the environment in Laravel Cloud

```
MAIL_MAILER=smtp
MAIL_HOST=email-smtp.eu-west-2.amazonaws.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USERNAME=<SES SMTP username>
MAIL_PASSWORD=<SES SMTP password>
MAIL_FROM_ADDRESS=noreply@hotel-tech.ai
AWS_DEFAULT_REGION=eu-west-2
SES_TOPIC_ARN=arn:aws:sns:eu-west-2:301556367642:hexatech-ses-feedback
```

`SES_TOPIC_ARN` is not optional. It is the credential for the webhook: without
it, anyone who guessed the URL could POST a forged complaint and permanently
suppress any address. `SesWebhookController` refuses unverified notifications in
production.

### 7. Raise the campaign pace
SES production accounts start around 14 messages/second — far above the shared
relay this replaces. Once live, `MAIL_CAMPAIGN_CHUNK_SECONDS` can drop from 60
toward 5–10. Check your account's actual sending quota first.

### 8. Verify end to end
- Send a test from the app; confirm it arrives and check the headers show
  `spf=pass`, `dkim=pass`, `dmarc=pass`.
- Send to the SES simulator addresses, which do not affect reputation:
  `bounce@simulator.amazonses.com` and `complaint@simulator.amazonses.com`.
  Each should create a row in `email_suppressions`, and a second send to the
  same address should be cancelled before it reaches the transport.
