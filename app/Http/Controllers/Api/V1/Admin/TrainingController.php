<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\KnowledgeItem;
use App\Models\KnowledgeDocument;
use App\Models\TrainingJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class TrainingController extends Controller
{
    /**
     * List training jobs.
     */
    public function index(Request $request): JsonResponse
    {
        $jobs = TrainingJob::where('organization_id', $request->user()->organization_id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json($jobs);
    }

    /**
     * Show a single training job.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $job = TrainingJob::where('organization_id', $request->user()->organization_id)->findOrFail($id);

        return response()->json($job);
    }

    /**
     * Export training data as JSONL from FAQs + knowledge documents.
     */
    public function exportData(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        $items = KnowledgeItem::where('organization_id', $orgId)->active()->get();
        $docs = KnowledgeDocument::where('organization_id', $orgId)->completed()->get();

        $lines = [];

        // FAQ items → training pairs
        foreach ($items as $item) {
            $lines[] = json_encode([
                'messages' => [
                    ['role' => 'system', 'content' => 'You are a helpful hotel concierge AI assistant.'],
                    ['role' => 'user', 'content' => $item->question],
                    ['role' => 'assistant', 'content' => $item->answer],
                ],
            ]);
        }

        // Document excerpts → knowledge grounding pairs
        foreach ($docs as $doc) {
            if (empty($doc->extracted_text)) continue;

            $excerpt = mb_substr($doc->extracted_text, 0, 2000);
            $lines[] = json_encode([
                'messages' => [
                    ['role' => 'system', 'content' => 'You are a helpful hotel concierge AI assistant. Use the following document as reference: ' . $excerpt],
                    ['role' => 'user', 'content' => 'What information does the document "' . $doc->file_name . '" contain?'],
                    ['role' => 'assistant', 'content' => 'The document covers: ' . mb_substr($excerpt, 0, 500)],
                ],
            ]);
        }

        return response()->json([
            'jsonl' => implode("\n", $lines),
            'count' => count($lines),
            'faq_count' => $items->count(),
            'document_count' => $docs->count(),
        ]);
    }

    /**
     * Create a new training job (upload to OpenAI for fine-tuning).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'base_model' => 'nullable|string|max:60',
            'hyperparameters' => 'nullable|array',
            'hyperparameters.n_epochs' => 'nullable|integer|min:1|max:50',
            'hyperparameters.batch_size' => 'nullable|integer|min:1',
            'hyperparameters.learning_rate_multiplier' => 'nullable|numeric|min:0.01|max:10',
        ]);

        $orgId = $request->user()->organization_id;

        // Export training data
        $items = KnowledgeItem::where('organization_id', $orgId)->active()->get();
        if ($items->count() < 10) {
            return response()->json(['error' => 'At least 10 active FAQ items are required for fine-tuning'], 422);
        }

        $job = TrainingJob::create([
            'organization_id' => $orgId,
            'provider' => 'openai',
            'base_model' => $validated['base_model'] ?? 'gpt-4o-mini',
            'hyperparameters' => $validated['hyperparameters'] ?? null,
            'status' => 'preparing',
            'started_at' => now(),
        ]);

        // In production, this would dispatch a queued job to upload to OpenAI
        // For now, mark as preparing and return
        try {
            $lines = [];
            foreach ($items as $item) {
                $lines[] = json_encode([
                    'messages' => [
                        ['role' => 'system', 'content' => 'You are a helpful hotel concierge AI assistant.'],
                        ['role' => 'user', 'content' => $item->question],
                        ['role' => 'assistant', 'content' => $item->answer],
                    ],
                ]);
            }

            $jsonl = implode("\n", $lines);
            $path = 'training/' . $orgId . '_' . $job->id . '.jsonl';
            \Storage::disk('local')->put($path, $jsonl);

            $job->update([
                'training_data_path' => $path,
                'status' => 'uploading',
                'model_name' => $validated['base_model'] ?? 'gpt-4o-mini',
            ]);

            // Attempt OpenAI upload if API key is configured
            if (config('openai.api_key')) {
                $fileResponse = \OpenAI\Laravel\Facades\OpenAI::files()->upload([
                    'purpose' => 'fine-tune',
                    'file' => storage_path('app/' . $path),
                ]);

                $ftResponse = \OpenAI\Laravel\Facades\OpenAI::fineTuning()->createJob([
                    'training_file' => $fileResponse->id,
                    'model' => $validated['base_model'] ?? 'gpt-4o-mini',
                    'hyperparameters' => $validated['hyperparameters'] ?? ['n_epochs' => 3],
                ]);

                $job->update([
                    'training_file_id' => $fileResponse->id,
                    'job_id' => $ftResponse->id,
                    'status' => 'training',
                ]);
            }
        } catch (\Throwable $e) {
            Log::error('Training job creation failed', ['error' => $e->getMessage()]);
            $job->markFailed($e->getMessage());
        }

        return response()->json($job, 201);
    }

    /**
     * Cancel a training job.
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $job = TrainingJob::where('organization_id', $request->user()->organization_id)->findOrFail($id);

        if (in_array($job->status, ['completed', 'failed', 'cancelled'])) {
            return response()->json(['error' => 'Job already finished'], 422);
        }

        try {
            if ($job->job_id && config('openai.api_key')) {
                \OpenAI\Laravel\Facades\OpenAI::fineTuning()->cancelJob($job->job_id);
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to cancel OpenAI job', ['error' => $e->getMessage()]);
        }

        $job->update(['status' => 'cancelled', 'completed_at' => now()]);

        return response()->json($job);
    }

    /**
     * Get training data stats.
     */
    public function stats(Request $request): JsonResponse
    {
        $orgId = $request->user()->organization_id;

        return response()->json([
            'faq_count' => KnowledgeItem::where('organization_id', $orgId)->active()->count(),
            'document_count' => KnowledgeDocument::where('organization_id', $orgId)->completed()->count(),
            'total_items' => KnowledgeItem::where('organization_id', $orgId)->count(),
            'jobs_count' => TrainingJob::where('organization_id', $orgId)->count(),
            'active_jobs' => TrainingJob::where('organization_id', $orgId)->active()->count(),
        ]);
    }
}
