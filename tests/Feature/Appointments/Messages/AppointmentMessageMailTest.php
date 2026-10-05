<?php

namespace Tests\Feature\Appointments\Messages;

use App\Mail\AppointmentMessageMail;
use App\Models\ClientMessage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentMessageMailTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->org->forceFill(['address' => '12 Rue Lumière, Riga', 'phone' => '+371 2000 0000', 'email' => 'desk@lumiere.test'])->save();
    }

    private int $seq = 0;

    private function mail(string $kind, string $locale, array $row = []): AppointmentMessageMail
    {
        $booking = $this->seedBooking(['booking_reference' => sprintf('SVC-T%04d', ++$this->seq), 'cancellation_reason' => 'Therapist ill — private']);
        $message = ClientMessage::create(array_merge([
            'service_booking_id' => $booking->id, 'kind' => $kind, 'channel' => 'email', 'recipient' => 'sophie@example.test',
            'locale' => $locale, 'status' => 'queued', 'for_start_at' => '2026-10-06 10:00:00',
        ], $row));

        return new AppointmentMessageMail($message, $booking->fresh(['service', 'master']));
    }

    public function test_every_kind_in_every_language_names_the_service_the_venue_and_the_venues_time(): void
    {
        $dates = [
            'en' => 'Tuesday 6 October 2026, 10:00',
            'de' => 'Dienstag, 6. Oktober 2026, 10:00',
            'fr' => 'mardi 6 octobre 2026, 10:00',
            'es' => 'martes 6 de octubre de 2026, 10:00',
            'ru' => '10:00',
        ];
        foreach (ClientMessage::KINDS as $kind) {
            foreach ($dates as $locale => $date) {
                $mail = $this->mail($kind, $locale);
                $lines = $mail->lines();
                $this->assertStringContainsString('Deep Tissue Massage', $lines['subject'], "{$kind}/{$locale}");
                $this->assertStringContainsString('Lumière Salon', $lines['subject'], "{$kind}/{$locale}");
                $this->assertStringContainsString($date, $lines['subject'], "{$kind}/{$locale}");
                if ($locale !== 'en') {
                    $this->assertNotSame(__("client_messages.subject.{$kind}", [], 'en'), __("client_messages.subject.{$kind}", [], $locale), "{$kind}/{$locale} is translated");
                }

                $html = $mail->render();
                $this->assertStringContainsString('Sophie Williams', $html);
                $this->assertStringContainsString('Mara Ilves', $html);
                $this->assertStringContainsString($lines['rows'][count($lines['rows']) - 1]['value'], $html); // the reference
                $this->assertStringContainsString('12 Rue Lumière, Riga', $html);
                $this->assertStringContainsString('desk@lumiere.test', $html);
                $this->assertStringNotContainsString('Hospitality, refined', $html); // our own footer, not the English default
            }
        }
        $this->assertStringContainsString('2026', $this->mail('booked', 'ru')->lines()['subject']);
        $this->assertStringContainsString('октябр', $this->mail('booked', 'ru')->lines()['subject']);
    }

    public function test_a_move_names_the_former_time_and_a_cancellation_never_the_staff_reason(): void
    {
        $moved = $this->mail('moved', 'en', ['previous_start_at' => '2026-10-06 08:30:00'])->render();
        $this->assertStringContainsString('Tuesday 6 October 2026, 08:30', $moved);
        $this->assertStringContainsString('Previously', $moved);

        $cancelled = $this->mail('cancelled', 'en')->render();
        $this->assertStringNotContainsString('Therapist ill', $cancelled);
        $this->assertStringContainsString('To book again', $cancelled);
    }

    public function test_a_move_to_another_person_at_the_same_time_says_it_changed_not_that_the_time_did(): void
    {
        foreach (['en' => 'Changed:', 'ru' => 'Изменение:', 'de' => 'Geändert:', 'fr' => 'Modifié :', 'es' => 'Modificado:'] as $locale => $lead) {
            $mail = $this->mail('moved', $locale, ['previous_start_at' => '2026-10-06 10:00:00']);
            $lines = $mail->lines();

            $this->assertStringStartsWith($lead, $lines['subject'], $locale);
            $this->assertNotSame(__('client_messages.intro.moved', ['venue' => 'Lumière Salon'], $locale), $lines['intro'], $locale);
            $this->assertNotContains(__('client_messages.label.previously', [], $locale), array_column($lines['rows'], 'label'), $locale);
            $this->assertContains('Mara Ilves', array_column($lines['rows'], 'value'), $locale);
        }
    }

    public function test_the_venue_sends_it_and_receives_the_replies(): void
    {
        $envelope = $this->mail('reminder', 'en')->envelope();

        $this->assertSame('Lumière Salon', $envelope->from?->name);
        $this->assertSame('desk@lumiere.test', $envelope->replyTo[0]->address ?? null);
        $this->assertStringStartsWith('Reminder:', $envelope->subject);
    }
}
