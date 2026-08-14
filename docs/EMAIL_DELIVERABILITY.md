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

Do **not** claim: dedicated IP, per-customer sending domain, DMARC enforcement,
bounce/complaint processing, or a suppression list. None of those are in place.

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
- ✅ **Per-venue sender name and Reply-To** — campaigns are sent as the venue's
  name, with replies routed to the venue's own address when set.

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

### 3. No bounce, complaint or suppression handling
Verified absent. There is no bounce webhook, no feedback-loop processing and no
suppression list. Practically:
- Hard bounces are retried on the next campaign, which is one of the fastest
  ways to damage sender reputation.
- Spam complaints are invisible.
- There is no record of addresses that must never be mailed again.

This is the single biggest gap, and it cannot be closed without an ESP —
bounce/complaint data arrives via ESP webhooks.

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

### Step 2 — Bounce, complaint and suppression handling
With an ESP: add a webhook endpoint, a `suppressions` table (address, reason,
timestamp, org), and filter it in `EmailComplianceService::scopeEligible`.
Hard bounces and complaints suppress permanently; soft bounces after N attempts.

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
