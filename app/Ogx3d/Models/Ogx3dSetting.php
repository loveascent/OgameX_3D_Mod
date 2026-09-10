<?php

namespace OGame\Ogx3d\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Plain key/value for the mod's own handful of settings.
 *
 * @property string $key
 * @property string $value
 */
class Ogx3dSetting extends Model
{
    protected $table = 'ogx3d_settings';

    protected $primaryKey = 'key';

    public $incrementing = false;

    public $timestamps = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];
}
