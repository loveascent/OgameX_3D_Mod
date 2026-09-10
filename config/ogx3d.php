<?php

/**
 * OgameX 3D Mod - settings.
 *
 * You normally do not have to touch this file. Everything that matters day to day is
 * done in the game's admin bar under "3D Mod".
 */

return [

    /*
    |--------------------------------------------------------------------------
    | Where you drop your own files
    |--------------------------------------------------------------------------
    |
    | Both paths are relative to public/. Put .glb / .gltf files in the first one and
    | .png / .jpg / .webp / .gif icons in the second one; they then show up as choices
    | in the admin screen. The folders are created automatically if they go missing.
    */

    'model_dir' => 'Put_GLB_and_Icons_here/3D_GLB_Files_Here',
    'icon_dir' => 'Put_GLB_and_Icons_here/Icons_Here',

    /*
    |--------------------------------------------------------------------------
    | three.js
    |--------------------------------------------------------------------------
    |
    | The 3D viewer needs three.js (r160 or newer). By default it is loaded from a
    | public CDN, so there is nothing to install.
    |
    | If your server has no internet access, or you would rather not depend on a CDN,
    | download three.js yourself and put three.module.js plus its examples/jsm/ folder
    | into public/ogx3d/vendor/three/. The mod notices the local copy on its own and
    | stops using the CDN - see Ogx3dAssets::threeImports().
    */

    'three_cdn' => 'https://cdn.jsdelivr.net/npm/three@0.160.1/',

    /*
    |--------------------------------------------------------------------------
    | Cookie
    |--------------------------------------------------------------------------
    |
    | Which graphics version a single browser is looking at. Only set when someone
    | picks a version by hand; without it everyone sees the server-wide version the
    | admin selected. Kept unencrypted so it is readable and debuggable from the
    | browser's own dev tools.
    */

    'cookie' => 'ogx3d_variant',

    /*
    |--------------------------------------------------------------------------
    | Fixed slots
    |--------------------------------------------------------------------------
    |
    | Places in the interface that are NOT a game object and therefore have no
    | class_name: the planet on the overview screen and the wide banner strips at the
    | top of the build pages.
    |
    | 'find' is a plain CSS selector, evaluated in the browser. 'unless' / 'only_with'
    | are optional extra selectors that must be absent / present on the same page -
    | that is how a planet is told apart from a moon, since OGameX paints both into
    | the same #planet element and only reveals which is which through the small
    | switch-to-the-other-body box beside it.
    |
    | 'keep_background' decides what happens to the artwork that is already there.
    | On a wide banner strip - a hangar, a surface panorama - leaving it in place and
    | flying the model in front of it is what makes the screen still read as the game;
    | switch it off and the strip goes transparent and the model floats on the page
    | background. On the overview body it is off, because a planet standing in front of
    | a photograph of a planet reads as a mistake.
    */

    'slots' => [
        'overview_planet' => [
            'label' => 'Overview - planet',
            'find' => '#inhalt > #planet',
            'unless' => '#planet_as_moon',
            'motion' => 'spin',
            'view' => 'free',
            'keep_background' => false,
        ],
        'overview_moon' => [
            'label' => 'Overview - moon',
            'find' => '#inhalt > #planet',
            'only_with' => '#planet_as_moon',
            'motion' => 'spin',
            'view' => 'free',
            'keep_background' => false,
        ],
        'shipyard_banner' => [
            'label' => 'Shipyard - banner',
            'find' => '#shipyardcomponent header',
            'motion' => 'spin',
            'view' => 'free',
            'keep_background' => true,
        ],
        'defense_banner' => [
            'label' => 'Defence - banner',
            'find' => '#defensescomponent header',
            'motion' => 'spin',
            'view' => 'free',
            'keep_background' => true,
        ],
        'research_banner' => [
            'label' => 'Research - banner',
            'find' => '#researchcomponent header',
            'motion' => 'spin',
            'view' => 'free',
            'keep_background' => true,
        ],
        'facilities_banner' => [
            'label' => 'Facilities - banner',
            'find' => '#facilitiescomponent header',
            'motion' => 'spin',
            'view' => 'free',
            'keep_background' => true,
        ],
        'supplies_banner' => [
            'label' => 'Resources - banner',
            'find' => '#suppliescomponent header',
            'motion' => 'spin',
            'view' => 'free',
            'keep_background' => true,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Lighting presets
    |--------------------------------------------------------------------------
    |
    | Picked per object in the admin screen. Everything here is plain colour and
    | intensity - nothing is model-specific, so a preset that suits your models can be
    | added by copying a block and changing the numbers.
    |
    |   sun   main light   f = colour, i = intensity, p = direction
    |   rim   back light   same three
    |   amb   sky/ground fill
    |   sky / haze         the two colours the reflection environment is built from
    */

    'presets' => [
        'studio' => [
            'label' => 'Studio (neutral)',
            'sky' => '#2d3446', 'haze' => '#181d29',
            'sun' => ['f' => '#fff4ff', 'i' => 4.75, 'p' => [4, 6, 7]],
            'rim' => ['f' => '#88a1de', 'i' => 1.51, 'p' => [-6, -2, -5]],
            'amb' => ['top' => '#99a4ce', 'bottom' => '#242a3a', 'i' => 1.73],
        ],
        'deep' => [
            'label' => 'Deep space',
            'sky' => '#0e1425', 'haze' => '#050a13',
            'sun' => ['f' => '#fff4ff', 'i' => 6.48, 'p' => [7, 3, 4]],
            'rim' => ['f' => '#2d3d69', 'i' => 0.86, 'p' => [-6, -3, -6]],
            'amb' => ['top' => '#404d6b', 'bottom' => '#0b0f19', 'i' => 0.76],
        ],
        'warm' => [
            'label' => 'Close to a star',
            'sky' => '#3e2110', 'haze' => '#271308',
            'sun' => ['f' => '#ffd7b5', 'i' => 8.1, 'p' => [6, 4, 3]],
            'rim' => ['f' => '#ff7531', 'i' => 2.59, 'p' => [-5, -3, -5]],
            'amb' => ['top' => '#f09d6b', 'bottom' => '#381b0a', 'i' => 2.16],
        ],
        'cold' => [
            'label' => 'Cold star',
            'sky' => '#0c2c4e', 'haze' => '#07172b',
            'sun' => ['f' => '#ebe5ff', 'i' => 6.05, 'p' => [5, 6, 5]],
            'rim' => ['f' => '#2d80bd', 'i' => 1.73, 'p' => [-6, -2, -6]],
            'amb' => ['top' => '#7195ce', 'bottom' => '#0f1b2b', 'i' => 1.62],
        ],
        'nebula' => [
            'label' => 'Nebula',
            'sky' => '#37215d', 'haze' => '#1f1434',
            'sun' => ['f' => '#f8c3ff', 'i' => 4.32, 'p' => [3, 5, 6]],
            'rim' => ['f' => '#ff89c1', 'i' => 2.16, 'p' => [-5, -2, -4]],
            'amb' => ['top' => '#af82e3', 'bottom' => '#2f1f46', 'i' => 2.59],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Viewer defaults
    |--------------------------------------------------------------------------
    |
    | preset   which of the above to use when an object has no preset of its own
    | motion   'hover' (a slow drift, for ships), 'spin' (a slow turn, for anything
    |          anchored in space) or 'still'
    | spin     turn rate, 1 = about one revolution in fifteen minutes
    | zoom     framing, below 1 pulls the camera in, above 1 pushes it back
    | shadow   opacity of the cast shadow on the ground, 0 switches it off
    */

    'defaults' => [
        'preset' => 'studio',
        'motion' => 'hover',
        'spin' => 1.0,
        'zoom' => 1.0,
        'shadow' => 0.36,
    ],

];
