<?php

/**
 * OgameX 3D Mod - installer.
 *
 * Run this once, from your OGameX folder:
 *
 *     php ogx3d-install.php
 *
 * It does the only thing a file copy cannot do for itself: register the mod's service
 * provider. Everything else the mod needs - routes, migrations, views, the middleware -
 * is wired up from that one provider, so this script has exactly one line to add.
 *
 * It is safe to run twice. It changes nothing that is already correct, and it writes a
 * backup of the file it touches.
 */

const PROVIDER = 'OGame\\Ogx3d\\Ogx3dServiceProvider::class,';

$root = __DIR__;

echo "\n  OgameX 3D Mod - installer\n";
echo "  -------------------------\n\n";

/* ------------------------------------------------------------------
 * Am I in the right folder?
 *
 * Copying the mod into the wrong directory is the most likely way for this to go
 * wrong, and the symptom would otherwise be a php error nobody can read.
 * ---------------------------------------------------------------- */

$needed = ['artisan', 'bootstrap/providers.php', 'app', 'public'];
foreach ($needed as $path) {
    if (!file_exists($root . '/' . $path)) {
        fail("This does not look like an OGameX folder: '$path' is missing.\n"
            . "  Copy the mod's files INTO your OGameX folder (the one with artisan in it), then run this again.");
    }
}
if (!is_dir($root . '/app/Ogx3d')) {
    fail("app/Ogx3d is missing - the mod's own files did not arrive.\n"
        . "  Copy the WHOLE contents of the mod folder into your OGameX folder, keeping the folder structure.");
}
ok('OGameX folder found');

/* ------------------------------------------------------------------
 * The one line
 * ---------------------------------------------------------------- */

$providersFile = $root . '/bootstrap/providers.php';
$providers = (string) file_get_contents($providersFile);

if (str_contains($providers, 'Ogx3dServiceProvider')) {
    ok('Service provider already registered');
} else {
    /*
     * TRY, THEN CHECK, THEN PUT IT BACK IF IT IS WRONG.
     *
     * The line goes in front of the closing bracket of the returned array, and the way
     * to find that bracket is to look for "];". Usually the last one in the file is it -
     * but a comment underneath, or a second array, moves it, and this is a file the
     * application cannot boot without.
     *
     * So each candidate is TRIED: the file is written, read back with require (a syntax
     * error surfaces there as a catchable ParseError), and the result checked for being
     * an array that now contains this provider. The first candidate that survives that
     * wins; if none does, the original goes back untouched and the user is told the one
     * line to add by hand.
     */
    copy($providersFile, $providersFile . '.ogx3d-backup');

    $candidates = [];
    for ($at = strlen($providers); ($at = strrpos(substr($providers, 0, $at), '];')) !== false;) {
        $candidates[] = $at;
    }
    if ($candidates === []) {
        fail("Could not find the provider array in bootstrap/providers.php.\n"
            . "  Add this line to it by hand:\n      " . PROVIDER);
    }

    $done = false;
    foreach ($candidates as $position) {
        $patched = substr($providers, 0, $position)
            . '    ' . PROVIDER . "\n"
            . substr($providers, $position);

        if (file_put_contents($providersFile, $patched) === false) {
            fail("bootstrap/providers.php is not writable.\n"
                . "  Add this line to the array by hand:\n      " . PROVIDER);
        }

        try {
            $result = require $providersFile;
            $wanted = trim(PROVIDER, ',');
            foreach (is_array($result) ? $result : [] as $entry) {
                if (is_string($entry) && $entry . '::class' === $wanted) {
                    $done = true;
                    break;
                }
            }
        } catch (Throwable) {
            $done = false;
        }

        if ($done) {
            break;
        }
        // require caches by path, so a second attempt on the same file would return the
        // first attempt's result. Forget it before trying the next candidate.
        if (function_exists('opcache_invalidate')) {
            @opcache_invalidate($providersFile, true);
        }
    }

    if (!$done) {
        copy($providersFile . '.ogx3d-backup', $providersFile);
        fail("Could not safely edit bootstrap/providers.php - it has been put back as it was.\n"
            . "  Add this line to the array inside it by hand:\n      " . PROVIDER);
    }

    ok('Service provider registered (backup: bootstrap/providers.php.ogx3d-backup)');
}

/* ------------------------------------------------------------------
 * The drop folders
 * ---------------------------------------------------------------- */

foreach (['public/Put_GLB_and_Icons_here/3D_GLB_Files_Here', 'public/Put_GLB_and_Icons_here/Icons_Here'] as $dir) {
    if (!is_dir($root . '/' . $dir)) {
        @mkdir($root . '/' . $dir, 0775, true);
    }
    is_dir($root . '/' . $dir) ? ok('Folder ready: ' . $dir) : warn('Could not create ' . $dir);
}

/* ------------------------------------------------------------------
 * What to do next
 * ---------------------------------------------------------------- */

echo "\n  Almost done. Two more commands, in this folder:\n\n";
echo "      php artisan migrate\n";
echo "      php artisan ogx3d:doctor\n\n";
echo "  Then open the game, log in as an admin, and click \"3D Mod\" in the admin bar.\n\n";

exit(0);

function ok(string $message): void
{
    echo "  OK    $message\n";
}

function warn(string $message): void
{
    echo "  NOTE  $message\n";
}

function fail(string $message): never
{
    echo "\n  STOP  $message\n\n";
    exit(1);
}
