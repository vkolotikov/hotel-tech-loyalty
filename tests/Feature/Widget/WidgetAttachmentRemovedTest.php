<?php

namespace Tests\Feature\Widget;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Visitors can no longer upload files through the chat widget.
 *
 * The endpoint was unauthenticated by nature: a widget key is public — it
 * ships in the embed snippet on every page — so anyone who read the page
 * source could POST an 8MB pdf/doc/docx into a venue's inbox, repeatedly,
 * from any address. The files landed on shared object storage with no
 * retention or cleanup, and staff opened them from the admin inbox. That is
 * an unbounded storage bill and a malicious-document path into the venue's
 * own team, in exchange for a feature no customer had asked for.
 *
 * Taking the button out of the widget alone would have fixed neither: the
 * route does not care whether a button exists. So the control, its upload
 * function, the route and the controller method are all gone.
 *
 * Two things deliberately stay:
 *  - the widget's attachment RENDERER, because staff still send files to
 *    visitors and existing conversations already hold visitor uploads that
 *    must keep displaying;
 *  - the authenticated staff upload route, which is a different feature with
 *    a different threat model.
 */
class WidgetAttachmentRemovedTest extends TestCase
{
    private function widgetJs(): string
    {
        return file_get_contents(public_path('widget/hotel-chat.js'));
    }

    public function test_the_public_visitor_upload_route_no_longer_exists(): void
    {
        $uploads = collect(Route::getRoutes())
            ->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/widget/'))
            ->filter(fn ($r) => str_contains($r->uri(), 'upload'))
            ->map(fn ($r) => $r->uri())
            ->values()
            ->all();

        $this->assertSame([], $uploads,
            'A widget key is public, so any route under the widget prefix is reachable by '
            . 'anyone. Re-adding an upload here re-opens unauthenticated file delivery into '
            . 'the venue inbox: ' . implode(', ', $uploads));
    }

    public function test_posting_to_the_old_upload_endpoint_is_not_handled(): void
    {
        // The concrete request that used to work.
        $response = $this->postJson('/api/v1/widget/' . fake()->uuid() . '/upload', [
            'session_id' => 'whatever',
        ]);

        $this->assertContains($response->status(), [404, 405],
            'The old upload endpoint still routes somewhere.');
    }

    public function test_the_controller_no_longer_carries_an_upload_handler(): void
    {
        $this->assertFalse(
            method_exists(\App\Http\Controllers\Api\V1\Widget\WidgetChatController::class, 'uploadAttachment'),
            'An unrouted handler is one line of routes away from being live again.',
        );
    }

    public function test_the_widget_ships_no_attachment_control(): void
    {
        $js = $this->widgetJs();

        foreach (['htchat-attach-btn', 'htchat-file', 'uploadFile', 'paperclip'] as $gone) {
            $this->assertStringNotContainsString($gone, $js,
                "The widget still references '{$gone}'.");
        }

        $this->assertStringNotContainsString("type=\"file\"", $js,
            'The widget still contains a file input.');
    }

    public function test_the_widget_still_renders_attachments_it_receives(): void
    {
        // Staff replies with files, and every attachment already stored in an
        // existing conversation, must keep rendering. Removing the renderer
        // along with the uploader would silently blank historical messages.
        $js = $this->widgetJs();

        $this->assertStringContainsString('attachment_url', $js);
        $this->assertStringContainsString('attachment_type', $js);
    }

    public function test_staff_can_still_send_attachments_and_that_route_stays_authenticated(): void
    {
        $route = collect(Route::getRoutes())
            ->first(fn ($r) => $r->uri() === 'api/v1/admin/chat-inbox/{id}/upload');

        $this->assertNotNull($route, 'Staff-to-visitor attachments were removed by mistake.');

        $middleware = $route->gatherMiddleware();
        $this->assertTrue(
            collect($middleware)->contains(fn ($m) => is_string($m) && str_starts_with($m, 'auth:')),
            'The staff upload route must stay behind authentication.',
        );
    }
}
