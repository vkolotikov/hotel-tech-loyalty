<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Models\ContentMedia;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentMediaLibrary;
use App\Services\Content\ContentRefused;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MediaController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => 'nullable|string|max:100']);
        $query = ContentMedia::query()->select('content_media.*')->addSelect(['usage_count' => DB::table('content_post_media')->selectRaw('count(*)')->whereColumn('media_id', 'content_media.id')]);
        $q = trim($data['q'] ?? '');
        if ($q !== '') {
            $query->where('name', 'like', '%'.addcslashes($q, '%_\\').'%');
        }

        return response()->json(['media' => $query->orderByDesc('id')->get()->map(ContentMediaLibrary::present(...))->values(), 'max_upload_bytes' => ContentMediaLibrary::maxUploadBytes()]);
    }

    public function store(Request $request): JsonResponse
    {
        $file = $request->file('file');
        if (! $file || ! $file->isValid()) {
            throw ValidationException::withMessages(['file' => ['Choose a file within the upload limit.']]);
        }
        if ($file->getSize() > ContentMediaLibrary::maxUploadBytes()) {
            throw ValidationException::withMessages(['file' => ['This file exceeds the upload limit.']]);
        }
        $mime = $file->getMimeType();
        if (! in_array($mime, ContentMediaLibrary::MIMES, true)
            || (str_starts_with((string) $mime, 'image/') && @getimagesize($file->getPathname()) === false)) {
            throw ValidationException::withMessages(['file' => ['Choose a JPEG, PNG, WebP, MP4, WebM or PDF file.']]);
        }
        $url = MediaService::upload($file, 'content/brand-'.ContentContext::brandId());
        try {
            $row = ContentMedia::create(['name' => mb_substr(basename($file->getClientOriginalName()), 0, 255), 'mime' => $mime,
                'size' => $file->getSize(), 'url' => $url]);
        } catch (\Throwable $error) {
            rescue(fn () => MediaService::delete($url), null, true);
            throw $error;
        }

        return response()->json(['media' => ContentMediaLibrary::present($row)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $row = ContentMedia::whereKey($id)->first() ?? throw new ContentRefused('not_found', 'This asset is unavailable.', 404);
        $row->update($request->validate(['archived' => 'required|boolean']));

        return response()->json(['media' => ContentMediaLibrary::present($row)]);
    }
}
