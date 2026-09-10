<?php

namespace OGame\Ogx3d\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One graphics version an admin has created. V1 is not represented here - it is the
 * shipped game and needs no row. See the migration for why.
 *
 * @property int $id
 * @property string $version_key
 * @property string $label
 * @property int $sort
 */
class Ogx3dVersion extends Model
{
    protected $table = 'ogx3d_versions';

    protected $fillable = ['version_key', 'label', 'sort'];
}
