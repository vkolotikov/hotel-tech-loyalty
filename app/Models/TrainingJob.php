<?php

namespace App\Models;

use App\Models\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

class TrainingJob extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id',
        'provider',
        'model_name',
        'training_file_id',
        'job_id',
        'status',
        'base_model',
        'fine_tuned_model',
        'training_data_path',
        'hyperparameters',
        'result_metrics',
        'started_at',
        'completed_at',
        'error_message',
    ];

    protected $casts = [
        'hyperparameters' => 'array',
        'result_metrics' => 'array',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['preparing', 'uploading', 'training']);
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    public function markCompleted(string $fineTunedModel, array $metrics = []): void
    {
        $this->update([
            'status' => 'completed',
            'fine_tuned_model' => $fineTunedModel,
            'result_metrics' => $metrics,
            'completed_at' => now(),
        ]);
    }

    public function markFailed(string $error): void
    {
        $this->update([
            'status' => 'failed',
            'error_message' => $error,
            'completed_at' => now(),
        ]);
    }
}
