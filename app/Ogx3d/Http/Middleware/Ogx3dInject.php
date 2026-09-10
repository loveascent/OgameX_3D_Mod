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
        $versions = $this->versions->all();
        $isAdmin = str_contains($html, 'id="adminbar"');

        /*
         * NOTHING TO CHOOSE, NOTHING TO SHOW A PLAYER.
         *
         * With only V1 in existence there is no second option to switch to, so the tiny
         * per-player switcher (below) would be a link to nowhere. The one thing that
         * still needs a way in is the admin screen itself - the only place a first
         * version can be created - and that reaches an admin through the admin bar
         * alone, nothing else.
         */
        if (count($versions) <= 1) {
            return $isAdmin ? $this->lightweightBlock($request, true, null) : '';
        }

        /*
         * UNDER V1 WITH OTHER VERSIONS TO OFFER, A PLAYER GETS THE SWITCH AND NOTHING
         * ELSE.
         *
         * Which version to look at is a display preference, exactly like the language
         * links sitting in the same footer - reachable by every player, not only by an
         * admin, and not gated behind the admin bar just because that is where the
         * admin screen happens to live. What the switch does NOT bring with it on V1 is
         * the stylesheet, the manifest or three.js: V1 stays the byte-for-byte original
         * except for this one small, inert link.
         */
        if ($version === Ogx3dVersions::ORIGINAL && !$request->is('admin/ogx3d*')) {
            return $this->lightweightBlock($request, $isAdmin, $versions);
        }

        $stamp = $this->assets->stamp($version);
        $manifest = $this->assets->manifestJson($version);

        $out = [];
        $out[] = '<!-- OgameX 3D Mod -->';
        $out[] = '<link rel="stylesheet" href="' . e(route('ogx3d.css', ['version' => $version])) . '?v=' . $stamp . '">';
        $out[] = '<script type="application/json" id="ogx3d-manifest">' . $this->safeJson($manifest) . '</script>';
        $out[] = '<script type="application/json" id="ogx3d-links">' . $this->safeJson($this->links($versions, $version)) . '</script>';

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
     * What a V1 page carries: the admin-bar link for an admin, the version switcher
     * for anyone at all if there is more than one version to switch to. Nothing else -
     * no stylesheet, no three.js, no manifest of objects to render.
     *
     * @param array<string, string>|null $versions null when there is nothing to switch to
     */
    private function lightweightBlock(Request $request, bool $isAdmin, array|null $versions): string
    {
        $links = ['admin' => $isAdmin ? route('ogx3d.admin.index') : null];
        if ($versions !== null) {
            $links['chooseBase'] = url('/ogx3d/choose');
            $links['versions'] = $versions;
            $links['current'] = Ogx3dVersions::ORIGINAL;
        }

        return "\n<!-- OgameX 3D Mod (V1: switcher only, no 3D assets) -->\n"
            . '<script type="application/json" id="ogx3d-links">' . $this->safeJson((string) json_encode($links, JSON_UNESCAPED_SLASHES)) . "</script>\n"
            . '<script type="module" src="' . e(asset('ogx3d/ogx3d.js')) . '"></script>' . "\n";
    }

    /**
     * The handful of urls and facts the browser side needs, so no route name and no
     * version list is hardcoded in js.
     *
     * @param array<string, string> $versions
     */
    private function links(array $versions, string $current): string
    {
        return (string) json_encode([
            'admin' => route('ogx3d.admin.index'),
            'chooseBase' => url('/ogx3d/choose'),
            'versions' => $versions,
            'current' => $current,
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
