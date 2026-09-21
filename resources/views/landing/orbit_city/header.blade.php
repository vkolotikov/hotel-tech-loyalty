{{--
  The header (data-block="header").

  The author's floating pill: a glass bar sitting 2.4rem below the top edge
  (the height of his offer bar), holding the brand lockup and the Book
  control. His bar is `position: absolute` over the hero photograph, which is
  why the hero pads for it. He names this block with no data-variant, and
  none is added for him.

  GENERATED FROM THE PAGE'S OWN DATA, never from tenant copy: the mark is the
  business's initials in his ring, the wordmark is its name, the descriptor
  is its own word for what it is. There is no `content.header.*` and there
  should not be.

  THE LOCKUP IS THE AUTHOR'S OWN THREE ELEMENTS — `<span>` ring, `<strong>`
  name, `<small>` descriptor — and on THIS author's hotel pages the
  descriptor sits INSIDE the <strong> (his `.brand strong` is a grid that
  stacks the two), where his gym pages set it beside it. His stylesheet
  addresses them by element, so no class is added to any of them. A tenant's
  logo takes the ring (the appended `.brand span img` rule keeps it inside),
  and the wordmark's conjunction, if the business has one, is set in the
  accent by App\Landing\Copy::wordmark() — derived from the name, never a
  leaf. The initials are `$brandInitials`, resolved once in layout.blade.php
  (hotel-8) for the header and the footer alike.

  NO NAVIGATION (polish-1, 2026-09-08, the owner's ruling): a landing page is
  ONE page, so the header carries the brand and the Book control and nothing
  else — no anchor list, no mobile menu. The author hid the Book control at
  his mobile breakpoint in favour of a menu; the stylesheet's appended block
  shows it there instead, in his own header grid (brand | book).
--}}
@php
    use App\Landing\Copy;
@endphp
  <header class="site-header" data-block="header">
    <div class="container header__inner">
@if (filled($brandName))
      <a class="brand" href="#top" aria-label="{{ $brandName }}">
@if ($content->contact->logoUrl !== null)
        <span aria-hidden="true"><img src="{{ $content->contact->logoUrl }}" alt="" decoding="async"></span>
@elseif ($brandInitials !== '')
        <span aria-hidden="true">{{ $brandInitials }}</span>
@endif
        <strong>{{ Copy::wordmark($brandName) }}@if ($brandDescriptor !== '')<small>{{ $brandDescriptor }}</small>@endif</strong>
      </a>
@endif
@if ($bookingHref !== null)
      {{-- This author's city page puts his arrow AFTER the label on the
           header control (his townhouse and retreat pages lead with the
           calendar); the fixed pill keeps the calendar on all three. --}}
      <a class="header__book" href="{{ $bookingHref }}"@if ($bookingIsFlow) data-action="open-booking" target="_blank" rel="noopener"@endif>{{ $chromeLabels['header'] }}@include('landing.shared.kit-icon', ['name' => 'arrow'])</a>
@endif
    </div>
  </header>
