{{--
  The no-image device (Appendix B 4.4).

  A --paper-2 field, a hairline, the subject's initials in Fraunces and an
  optional mono label. It is used in EVERY image slot on the page — service
  thumb, preview plate, portrait — at the same construction and only the size
  changing, which is what makes it read as a designed device rather than as
  six separate broken images.

  It is deliberately aria-hidden: the initials are a graphic derived from a
  name the surrounding markup already states in full, so announcing "S F" a
  second time adds nothing and costs a screen-reader user a stumble.

  Expects: $name (string|null), and optionally $label (string|null).
--}}
@php
    $words = preg_split('/\s+/', trim((string) ($name ?? '')), -1, PREG_SPLIT_NO_EMPTY) ?: [];

    // Two initials at most. A three-word treatment name rendered as "SFT" is
    // a monogram of nothing; two letters is a mark.
    $initials = mb_strtoupper(
        mb_substr((string) ($words[0] ?? ''), 0, 1) . mb_substr((string) ($words[1] ?? ''), 0, 1)
    );
@endphp
<span class="rp-plate rp-plate--mono" aria-hidden="true">
  <span class="rp-plate__mark">{{ $initials }}</span>
  @if (filled($label ?? null))
    <span class="rp-plate__label">{{ $label }}</span>
  @endif
</span>
