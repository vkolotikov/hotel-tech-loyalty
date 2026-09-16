# Chat attribution corrections — 16 September 2026

Three defects in the business-outcome reporting shipped on 12 September. All three made the
export claim less, or something different, than the evidence already in the database supported.
No new column, no migration, no change to what is collected or to the consent gate.

## 1. The channel was read from the wrong page

`captureEntry()` classified from the page the visitor had reached when they opened the chat
panel. A visitor who arrives on `/?gclid=…` from Google Ads, browses to `/pricing`, then opens
chat was classified from `/pricing` alone. The click id was gone, so `entrySource()` fell
through to `unknown` — and once the referrer fallback below exists, it would have fallen to
`organic`, filing a paid click as free search.

`captureEntry()` now takes the visitor id and reads the first `visitor_page_views` row of the
current session, which already holds the true landing `url` and `referrer`. Both call sites in
`WidgetChatController` pass it.

- The **site** still comes from the page the chat runs on. That is which brand was being
  visited and must not follow the visitor back to wherever they first arrived.
- The lookback is **six hours**. A returning visitor's first ever page view is not this
  conversation's acquisition, and crediting a months-old campaign is worse than admitting the
  source is unknown.
- The lookup is **non-fatal**. It runs on the hot path of every new conversation; a thrown
  query would 500 the init request and the panel would never open. On failure it logs and falls
  back to the previous behaviour.

## 2. The referrer was never consulted

`entrySource()` returned `unknown` for every visitor without a `utm_*` tag or a click id, so
ordinary search, social and referral traffic was indistinguishable from traffic we genuinely
could not see. The widget's own browser-side classifier has had this fallback since it was
written; the server did not.

It now falls back to the referrer host: owned hosts are `internal`, the search engines are
`organic`, the social networks are `social`, anything else is `referral`. A campaign tag or a
click id still outranks the referrer.

An absent referrer stays `unknown` rather than becoming `direct`. Privacy settings, in-app
browsers and https-to-http hops all strip it, so a missing referrer is not evidence of a direct
visit. This matches the card builder's classifier, which documents the same choice.

## 3. The completeness flag reported the wrong thing

`$truncated` carries "the 20 000-row cap was hit", and the consumer uses it to reject an
incomplete replacement. The enquiry loop reused the same variable for its own touch-list
truncation, so any report containing one long journey claimed the whole snapshot was cut off,
while a genuinely truncated snapshot containing a short journey claimed it was complete. The
inner variable is now `$touchesTruncated`.

## What this does not fix

Attribution still requires analytics consent and an owned marketing host, and
`chat_message` and `chat_started` rows still carry no channel by design — only a saved enquiry
does. Conversations created before 12 September keep a null entry source forever, because
`captureEntry` only ever runs on creation.

## Verification

```
php artisan test tests/Feature/BusinessOutcomeReportTest.php   8 passed
php artisan test tests/Feature/Widget                         41 passed
php artisan test tests/Feature/WidgetRealtime                 12 passed
php artisan test tests/Feature/Chatbot                        47 passed
php artisan test tests/Feature/Crm                           267 passed
php artisan test tests/Feature/Analytics                       7 passed
php artisan test tests/Feature/LeadForm                       33 passed
```

The three new tests in `BusinessOutcomeReportTest` were each confirmed to fail against the
previous code and pass against this one.
