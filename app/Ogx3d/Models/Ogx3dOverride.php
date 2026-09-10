<?php

namespace OGame\Ogx3d\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One reassigned graphic, inside one version.
 *
 * @property int $id
 * @property string $version_key
 * @property string $target
 * @property string|null $image_path
 * @property string|null $model_path
 * @property string|null $model_preset
 * @property string|null $model_motion
 * @property float|null $model_spin
 * @property float|null $model_zoom
 */
class Ogx3dOverride extends Model
{
    protected $table = 'ogx3d_overrides';

    protected $fillable = [
        'version_key',
        'target',
        'image_path',
        'model_path',
        'model_preset',
        'model_motion',
        'model_spin',
        'model_zoom',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'model_spin' => 'float',
            'model_zoom' => 'float',
        ];
    }
}
