{{--
  The LocalBusiness structured-data block, shared by every landing template
  that is not The Ruled Page.

  WHY IT IS HERE AND NOT INSIDE A LAYOUT. Being findable is the entire reason
  these pages are server-rendered Blade rather than a client-rendered SPA, so
  every template needs this block, and it is a hundred lines of judgement
  about what may honestly be claimed — which is not a thing to re-derive per
  design.

  KNOWN, DELIBERATE DUPLICATION, recorded rather than hidden:
  landing/ruled_page/layout.blade.php still carries its own copy of exactly
  this logic. That copy is what four BYTE goldens in RuledPageRenderTest pin,
  and the task that added the nocturne template was explicitly not allowed to
  move them (it adds a template; it does not change one). Extracting
  ruled_page's copy into this file is a one-line change plus a deliberate
  golden re-capture, and it is the next editor's to make — this note exists
  so they find it. Until then: a fix here needs the same fix there.

  WHAT THE RULES ARE (transcribed from that copy, unchanged):

  @json is mandatory and is not optional styling: it encodes with
  JSON_HEX_TAG|JSON_HEX_APOS|JSON_HEX_AMP|JSON_HEX_QUOT, so a business name
  containing a literal closing script tag is escaped and cannot close the
  element early. A hand-built json_encode() or a string-built script tag here
  would be exactly the stored XSS this directory's escaping discipline exists
  to prevent.

  Every scalar and sub-array is filtered with filled(), not a bare
  array_filter(): array_filter()'s default callback treats a business
  literally named "0" as falsy and drops it, while the <title> chain (a plain
  ?? chain) would still print it — the page and its own structured data would
  disagree about the business's name. A page with no Property must degrade to
  a field being ABSENT, never to "name": null, and a stray
  {"@type":"PostalAddress"} with nothing else in it is the same fabrication
  one level down.

  A business with no name is that fabrication one level UP — Google's tooling
  reports "Missing field 'name'" — so the whole script is suppressed once
  $localBusiness carries no name.

  The nonce is inert under this page's actual policy (script-src is 'self'
  with no nonce token in it at all) and is kept only for consistency with
  every other tag that carries the request nonce: a
  <script type="application/ld+json"> is not "script" under the HTML parsing
  algorithm's type check, so it is never evaluated against script-src at all.

  openingHoursSpecification comes from $content->hours, never from Property.
  A day is only published if it is not closed AND both open and close are
  present: a day with nulls and closed=false is unknown, not open.

  aggregateRating and review are gated on TWO things, and the second is not a
  re-statement of the first: $content->reviewStats is null below
  PageContent::MIN_REVIEWS_FOR_AGGREGATE ratings, and $rendersReviews is the
  caller's own answer about whether a visitor can SEE the reviews band.
  Invisible structured data is against Google's structured data policies and
  risks a manual action on the tenant's whole site, so the markup follows the
  BAND, not the rating count — and there are more ways to have no band than
  there are to have no ratings (no featured review, the band switched off, no
  reviews row on the page at all). $rendersReviews must therefore be derived
  from the same collection the caller's section loop iterates, never spelled
  as a second expression beside it.

  review's author name and body truncation match the templates' own review
  partials exactly, so structured data never claims to quote more of a review
  than the page actually shows.
--}}
@php
    use Illuminate\Support\Str;

    $ldAddress = array_filter([
        'streetAddress'   => $content->contact->address,
        'addressLocality' => $content->contact->city,
        'addressCountry'  => $content->contact->country,
    ], fn ($v) => filled($v));
    if ($ldAddress !== []) {
        $ldAddress = ['@type' => 'PostalAddress'] + $ldAddress;
    }

    $ldDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    $ldHours = collect($content->hours ?? [])
        ->reject(fn ($row) => $row['closed'] || $row['open'] === null || $row['close'] === null)
        ->map(fn ($row) => [
            '@type'     => 'OpeningHoursSpecification',
            'dayOfWeek' => 'https://schema.org/' . $ldDayNames[$row['day']],
            'opens'     => $row['open'],
            'closes'    => $row['close'],
        ])
        ->values()
        ->all();

    $ldAggregate = null;
    $ldReviews   = null;

    if ($content->reviewStats !== null && $rendersReviews) {
        $ldAggregate = [
            '@type'       => 'AggregateRating',
            'ratingValue' => $content->reviewStats['average'],
            'reviewCount' => $content->reviewStats['count'],
            'bestRating'  => 5,
            'worstRating' => 1,
        ];

        $ldReviews = $content->reviews->map(function ($review) {
            $author = filled($review->anonymous_name) ? $review->anonymous_name : 'Verified client';
            $body   = Str::limit(trim((string) $review->comment), 340, '…', preserveWords: true);

            return array_filter([
                '@type'        => 'Review',
                'author'       => ['@type' => 'Person', 'name' => $author],
                'reviewBody'   => $body,
                'reviewRating' => $review->overall_rating === null ? null : [
                    '@type'       => 'Rating',
                    'ratingValue' => $review->overall_rating,
                    'bestRating'  => 5,
                    'worstRating' => 1,
                ],
            ], fn ($v) => filled($v));
        })->values()->all();
    }

    // @json's compiler splits its argument on every literal comma with no
    // awareness of brackets (CompilesJson::compileJson() is a plain
    // explode(',')), which silently corrupts the escaping flags or fails to
    // parse outright. Building the value in a variable first and handing
    // @json a bare reference puts zero commas in the directive's own
    // argument, so neither failure mode applies.
    $localBusiness = array_filter([
        '@context'    => 'https://schema.org',
        '@type'       => $content->profile->schemaType(),
        'name'        => $content->contact->name,
        'url'         => url('/' . $page->slug),
        'description' => $page->seo['description'] ?? null,
        'address'     => $ldAddress,
        'telephone'   => $content->contact->phone,
        'email'       => $content->contact->email,
        'openingHoursSpecification' => $ldHours,
        'aggregateRating' => $ldAggregate,
        'review'          => $ldReviews,
    ], fn ($v) => filled($v));

    if (blank($localBusiness['name'] ?? null)) {
        $localBusiness = null;
    }
@endphp
@if ($localBusiness !== null)
<script type="application/ld+json" nonce="{{ $cspNonce }}">
  @json($localBusiness)
</script>
@endif
