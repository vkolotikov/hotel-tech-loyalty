<?php

namespace Tests\Unit\Voice;

use App\Voice\SpeakableRenderer;
use PHPUnit\Framework\TestCase;

class SpeakableRendererTest extends TestCase
{
    public function test_counts_are_spoken_words_with_correct_plurals(): void
    {
        $renderer = new SpeakableRenderer('en');
        $this->assertSame('no leads', $renderer->countPhrase(0, 'lead', 'leads'));
        $this->assertSame('one lead', $renderer->countPhrase(1, 'lead', 'leads'));
        $this->assertSame('twelve leads', $renderer->countPhrase(12, 'lead', 'leads'));
        $this->assertSame('forty leads', $renderer->countPhrase(40, 'lead', 'leads'));
    }

    public function test_counts_are_spoken_in_the_active_locale(): void
    {
        $this->assertSame('двенадцать leads', (new SpeakableRenderer('ru'))->countPhrase(12, 'lead', 'leads'));
    }

    public function test_names_are_first_name_and_last_initial(): void
    {
        $renderer = new SpeakableRenderer('en');
        $this->assertSame('Morgan L.', $renderer->personName('Morgan Lee'));
        $this->assertSame('Morgan', $renderer->personName('Morgan'));
        $this->assertSame('Morgan V.', $renderer->personName('  Morgan  de Vries '));
        $this->assertSame('an unnamed customer', $renderer->personName(null));
        $this->assertSame('an unnamed customer', $renderer->personName('   '));
    }

    public function test_contact_details_never_survive_redaction(): void
    {
        $redacted = (new SpeakableRenderer('en'))->redactContact([
            'full_name' => 'Morgan Lee',
            'email' => 'morgan@example.com',
            'phone' => '+44 7700 900000',
            'passport_no' => 'X123',
            'customer' => ['mobile_phone' => '+371 20000000', 'company' => 'Cards'],
        ]);

        $this->assertSame(['full_name', 'customer', 'contact_on_file'], array_keys($redacted));
        $this->assertTrue($redacted['contact_on_file']);
        $this->assertSame(['company' => 'Cards', 'contact_on_file' => true], $redacted['customer']);

        $encoded = json_encode($redacted);
        foreach (['morgan@example.com', '7700', 'X123', '371'] as $secret) {
            $this->assertStringNotContainsString($secret, $encoded);
        }
    }

    public function test_nearby_days_are_relative_and_others_are_spoken_dates(): void
    {
        $renderer = new SpeakableRenderer('en');
        $this->assertSame('today', $renderer->dayPhrase('2026-09-12', '2026-09-12'));
        $this->assertSame('yesterday', $renderer->dayPhrase('2026-09-11', '2026-09-12'));
        $this->assertSame('tomorrow', $renderer->dayPhrase('2026-09-13', '2026-09-12'));
        $this->assertSame('Friday the fourth of September', $renderer->dayPhrase('2026-09-04', '2026-09-12'));
    }
}
