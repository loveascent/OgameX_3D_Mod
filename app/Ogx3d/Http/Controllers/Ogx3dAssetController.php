<?php

namespace OGame\Ogx3d\Http\Controllers;

use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use OGame\Ogx3d\Services\Ogx3dAssets;
use OGame\Ogx3d\Services\Ogx3dVersions;

/**
 * Serves the generated stylesheet.
 *
 * No session, no auth, no csrf: it is a static-shaped asset requested by a <link> on
 * every page, and putting it through the session middleware would mean a session read
 * per stylesheet request for a file whose content does not depend on who is asking.
 */
class Ogx3dAssetController extends Controller
{
    public function __construct(
        private readonly Ogx3dAssets $assets,
        private readonly Ogx3dVersions $versions,
    ) {
    }

    public function css(string $version): Response
    {
        // An unknown version gets an empty stylesheet rather than a 404: a stale <link>
        // in a cached page should leave the game looking normal, not put a red line in
        // the console for every player who has not reloaded yet.
        $body = $this->versions->exists($version) ? $this->assets->css($version) : '';

        return response($body, 200, [
            'Content-Type' => 'text/css; charset=UTF-8',
            // The url carries both the version and a hash of the body, so a cached copy
            // can only ever be the right one.
            'Cache-Control' => 'public, max-age=604800',
        ]);
    }
}
