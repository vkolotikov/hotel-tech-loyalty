<?php

namespace App\Services\Content\Web;

/** A page the scan read: its final address (after redirects), its media type, its body and its Content-Type header. */
final class WebResponse
{
    public function __construct(
        public readonly string $url,
        public readonly string $type,
        public readonly string $body,
        public readonly string $contentType,
    ) {
    }
}
