<?php

/**
 * Default booking engine configuration.
 * Per-org overrides are stored in hotel_settings as JSON.
 */
return [
    'units'  => [],
    'extras' => [],

    'policies' => [
        'check_in_time'  => '15:00',
        'check_out_time' => '11:00',
        'min_nights'     => 1,
        'currency'       => 'EUR',
        'tax_rate'       => 0,
    ],
];
