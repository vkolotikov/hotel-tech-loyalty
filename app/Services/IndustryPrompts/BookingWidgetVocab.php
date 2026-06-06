<?php

namespace App\Services\IndustryPrompts;

/**
 * Industry Platform Plan Phase 9 — booking widget vocabulary map.
 *
 * The public booking widget (`/book/{token}`) renders its UI in JS
 * at runtime, so the Blade exposes a static vocabulary object via
 * `window.WIDGET_VOCAB`. Hotel orgs keep the legacy English strings
 * verbatim (zero behaviour change). Beauty / medical / restaurant
 * orgs get industry-appropriate copy on the public booking page.
 *
 * Keys are stable JS identifiers consumed by the renderer in
 * `resources/views/booking-widget.blade.php`. New widget surfaces
 * MUST extend BOTH the hotel default AND the per-industry profiles
 * so settings-only industries don't fall through to an empty
 * string at runtime.
 *
 * Note: This widget today renders `BookingMirror` (hotel PMS) data
 * shape — it's wired against Smoobu rooms inventory. A non-hotel org
 * using the public booking widget today would see hotel-shaped data
 * paths even with this vocab swap (services use `/services/{token}`
 * via the parallel `service-widget` route, not /book/). Phase 9
 * vocab-swaps the SHELL copy for the day when non-hotel orgs do hit
 * this widget — but the underlying data shape is still hotel-only
 * until a Phase 9.x ship folds services rendering into the same shell.
 */
final class BookingWidgetVocab
{
    /**
     * @return array<string,mixed>  JSON-encodable vocab map for the
     *                              widget's window.WIDGET_VOCAB.
     */
    public static function for(string $industry): array
    {
        $defaults = self::hotelDefaults();

        return match ($industry) {
            'beauty'      => array_merge($defaults, self::beauty()),
            'medical'     => array_merge($defaults, self::medical()),
            'restaurant'  => array_merge($defaults, self::restaurant()),
            // Settings-only industries fall through to the hotel
            // defaults today. Phase 9.x adds per-industry overrides
            // once those verticals get GTM polish.
            default       => $defaults,
        };
    }

    private static function hotelDefaults(): array
    {
        return [
            // Step bar labels — must stay in sync with the renderer's
            // STEPS_NO_PAY / STEPS_PAY arrays.
            'steps_no_pay'      => ['Dates & Guests', 'Rooms & Rates', 'Extras', 'Details & Confirm'],
            'steps_pay'         => ['Dates & Guests', 'Rooms & Rates', 'Extras', 'Guest Details', 'Payment'],

            // Card titles + subtitles
            'search_title'      => 'Find Your Perfect Stay',
            'search_sub'        => 'Select your dates and guests to see available rooms',
            'extras_title'      => 'Enhance Your Stay',
            'details_title'     => 'Guest Details',

            // Form labels
            'check_in'          => 'Check-in',
            'check_out'         => 'Check-out',
            'adults'            => 'Adults',
            'children'          => 'Children',
            'select_date'       => 'Select date',

            // Buttons
            'search_button'     => 'Search Rooms',
            'searching'         => 'Searching…',
            'continue'          => 'Continue',
            'continue_payment'  => 'Continue to Payment',
        ];
    }

    private static function beauty(): array
    {
        return [
            'steps_no_pay'      => ['Date & Time', 'Treatments', 'Add-ons', 'Details & Confirm'],
            'steps_pay'         => ['Date & Time', 'Treatments', 'Add-ons', 'Client Details', 'Payment'],
            'search_title'      => 'Book Your Treatment',
            'search_sub'        => 'Pick your date and party size to see available treatments',
            'extras_title'      => 'Enhance Your Visit',
            'details_title'     => 'Client Details',
            'check_in'          => 'Date',
            'check_out'         => 'End',
            'adults'            => 'Clients',
            'children'          => 'Children',
            'select_date'       => 'Select date',
            'search_button'     => 'Search Treatments',
            'searching'         => 'Searching…',
            'continue'          => 'Continue',
            'continue_payment'  => 'Continue to Payment',
        ];
    }

    private static function medical(): array
    {
        return [
            'steps_no_pay'      => ['Date & Time', 'Appointment', 'Add-ons', 'Details & Confirm'],
            'steps_pay'         => ['Date & Time', 'Appointment', 'Add-ons', 'Patient Details', 'Payment'],
            'search_title'      => 'Book Your Appointment',
            'search_sub'        => 'Pick your date to see available consultation times',
            'extras_title'      => 'Additional Services',
            'details_title'     => 'Patient Details',
            'check_in'          => 'Date',
            'check_out'         => 'End',
            'adults'            => 'Patients',
            'children'          => 'Children',
            'select_date'       => 'Select date',
            'search_button'     => 'Search Appointments',
            'searching'         => 'Searching…',
            'continue'          => 'Continue',
            'continue_payment'  => 'Continue to Payment',
        ];
    }

    private static function restaurant(): array
    {
        return [
            'steps_no_pay'      => ['Date & Party', 'Tables', 'Add-ons', 'Details & Confirm'],
            'steps_pay'         => ['Date & Party', 'Tables', 'Add-ons', 'Diner Details', 'Payment'],
            'search_title'      => 'Reserve Your Table',
            'search_sub'        => 'Pick your date and party size to see available tables',
            'extras_title'      => 'Enhance Your Visit',
            'details_title'     => 'Diner Details',
            'check_in'          => 'Date',
            'check_out'         => 'End',
            'adults'            => 'Diners',
            'children'          => 'Children',
            'select_date'       => 'Select date',
            'search_button'     => 'Find Tables',
            'searching'         => 'Searching…',
            'continue'          => 'Continue',
            'continue_payment'  => 'Continue to Payment',
        ];
    }
}
