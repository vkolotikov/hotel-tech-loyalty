<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentPostQuery;
use App\Services\Content\ContentScheduleExport;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ExportController extends Controller
{
    public function download(Request $request, string $format): StreamedResponse
    {
        return ContentScheduleExport::download(ContentPostQuery::query(ContentPostQuery::filters($request)), $format);
    }
}
