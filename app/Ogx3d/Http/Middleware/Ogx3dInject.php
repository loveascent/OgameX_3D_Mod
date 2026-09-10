<?php

namespace OGame\Ogx3d\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use OGame\Ogx3d\Services\Ogx3dAssets;
use OGame\Ogx3d\Services\Ogx3dVersions;
use Symfony\Component\HttpFoundation\Response;

/**
 * Puts the mod's stylesheet, manifest and scripts into the page - WITHOUT editing a
 * single template of the game.
 *
 * WHY IT IS DONE THIS WAY
 * -----------------------
 * The obvious way is to add four lines to resources/views/ingame/layouts/main.blade.php.
 * It also means that every OGameX update, and every other mod, is now a merge conflict
 * with this one, and that uninstalling means remembering exactly which four lines were
 * added. Appending to the finished html instead means the mod owns no line of the
 * game's code: switch the service provider off and the game is byte-for-byte what it
 * was before, with nothing to undo.
 *
 * The cost is one string search per html response. Under V1 that search is the whole of
 * the work: a player's page gets nothing back, not even an empty stylesheet.
 */
class Ogx3dInject
{
    public function __construct(
        private readonly Ogx3dVersions $versions,
        private readonly Ogx3dAssets $assets,
    ) {
    }

    public function handle(Request $request, Closure $next): Response
    {
        /** @var Response $response */
        $response = $next($request);

        if (!$this->shouldInject($request, $response)) {
            return $response;
        }

        $html = $response->getContent();
        if (!is_string($html)) {
            return $response;
        }

        $position = strripos($html, '</head>');
        if ($position === false) {
            return $response;
        }

        $block = $this->block($request, $html);
        // Nothing to add - most often because this server is on V1 and the reader is an
        // ordinary player. Hand back the response object untouched rather than
        // rewriting it with the same string.
        if ($block === '') {
            return $response;
        }

        $response->setContent(substr($html, 0, $position) . $block . substr($html, $position));

        // What was just injected depends on a cookie. Laravel already marks
        // authenticated pages private, but a reverse proxy in front of the game has no
        // way of knowing that without being told - and the failure would be one
        // player's version being served to another.
        $response->headers->set('Vary', trim(($response->headers->get('Vary', '') ?? '') . ', Cookie', ', '));

        return $response;
    }

    private function shouldInject(Request $request, Response $response): bool
    {
        if ($response->getStatusCode() !== 200) {
            return false;
        }
        // Redirects, json, file downloads and streamed responses have no head to
        // inject into and no getContent() worth touching.
        if (!str_contains((string) $response->headers->get('Content-Type', 'text/html'), 'html')) {
            return false;
        }

        return method_exists($response, 'getContent');
    }

    /**
     * @param string $html the page as it stands, so the injector can look before it leaps
     */
    private function block(Request $request, string $html): string
    {
        $version = $this->versions->active();

        /*
         * UNDER V1, A PLAYER GETS NOTHING AT ALL.
         *
         * Not "an empty stylesheet" and not "a script that does nothing" - nothing. V1
         * is the shipped game, and the way to be sure of that is for the mod to emit
         * no byte into it.
         *
         * An ADMIN is the one exception, and only for one line: without it there would
         * be no way to reach the mod from a server sitting on V1, which is where every
         * server starts. The signal used is the admin bar itself - if the game rendered
         * one into this page, the reader is an admin, and no second permission check
         * can disagree with the game's own answer.
         */
        if ($version === Ogx3dVersions::ORIGINAL && !$request->is('admin/ogx3d*')) {
            return str_contains($html, 'id="adminbar"') ? $this->adminLinkOnly() : '';
        }

        $stamp = $this->assets->stamp($version);
        $manifest = $this->assets->manifestJson($version);

        $out = [];
        $out[] = '<!-- OgameX 3D Mod -->';
        $out[] = '<link rel="stylesheet" href="' . e(route('ogx3d.css', ['version' => $version])) . '?v=' . $stamp . '">';
        $out[] = '<script type="application/json" id="ogx3d-manifest">' . $this->safeJson($manifest) . '</script>';
        $out[] = '<script type="application/json" id="ogx3d-links">' . $this->safeJson($this->links()) . '</script>';

        // Only ONE import map is allowed per document, and a second one is a hard
        // error that takes the first one down with it. If the host page already has
        // one, stay out of its way and let the viewer fall back to the classic loader
        // path in ogx3d.js.
        if (!str_contains($html, 'type="importmap"') && !str_contains($html, "type='importmap'")) {
            $out[] = '<script type="importmap">'
                . (string) json_encode(['imports' => $this->assets->threeImports()], JSON_UNESCAPED_SLASHES)
                . '</script>';
        }

        $out[] = '<script type="module" src="' . e(asset('ogx3d/ogx3d.js')) . '?v=' . $stamp . '"></script>';

        return "\n" . implode("\n", $out) . "\n";
    }

    /**
     * The one line an admin gets while the server is still on V1: an entry in the
     * admin bar, and nothing else. No stylesheet, no three.js, no manifest.
     */
    private function adminLinkOnly(): string
    {
        // JSON_HEX_TAG, because this string is written into an inline <script>: a "<"
        // that survives into it could end the element early and drop the rest of the
        // page into the parser as markup.
        $url = json_encode(route('ogx3d.admin.index'), JSON_HEX_TAG | JSON_HEX_AMP);
        $active = request()->is('admin/ogx3d*') ? "a.className='active';" : '';

        return "\n<!-- OgameX 3D Mod (admin link only - this server is on V1) -->\n"
            . "<script>document.addEventListener('DOMContentLoaded',function(){"
            . "var u=document.querySelector('#adminbar #mmoContent ul');if(!u)return;"
            . "var l=document.createElement('li'),a=document.createElement('a');"
            . "a.href={$url};a.textContent='3D Mod';{$active}"
            . "l.appendChild(a);u.appendChild(l);});</script>\n";
    }

    /**
     * The handful of urls the browser side needs, so no route name is hardcoded in js.
     */
    private function links(): string
    {
        return (string) json_encode([
            'admin' => route('ogx3d.admin.index'),
        ], JSON_UNESCAPED_SLASHES);
    }

    /**
     * Make a json blob safe to sit inside a <script> element.
     *
     * "</script>" inside a json string ends the element early - the browser then reads
     * the rest of the json as html. A file called "</script>.glb" is admittedly
     * unlikely, but the failure is a blank page, and the fix is one str_replace.
     */
    private function safeJson(string $json): string
    {
        return str_replace(['</', '<!--'], ['<\\/', '<\\!--'], $json);
    }
}
