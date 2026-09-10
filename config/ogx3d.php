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
            'sky' => '#2a3644', 'haze' => '#161e28',
            'sun' => ['f' => '#ffffff', 'i' => 4.4, 'p' => [4, 6, 7]],
            'rim' => ['f' => '#7fa8d8', 'i' => 1.4, 'p' => [-6, -2, -5]],
            'amb' => ['top' => '#8fabc8', 'bottom' => '#222c38', 'i' => 1.6],
        ],
        'deep' => [
            'label' => 'Deep space',
            'sky' => '#0d1524', 'haze' => '#050a12',
            'sun' => ['f' => '#ffffff', 'i' => 6.0, 'p' => [7, 3, 4]],
            'rim' => ['f' => '#2a4066', 'i' => 0.8, 'p' => [-6, -3, -6]],
            'amb' => ['top' => '#3c5068', 'bottom' => '#0a1018', 'i' => 0.7],
        ],
        'warm' => [
            'label' => 'Close to a star',
            'sky' => '#3a2210', 'haze' => '#241408',
            'sun' => ['f' => '#ffe0b0', 'i' => 7.5, 'p' => [6, 4, 3]],
            'rim' => ['f' => '#ff7a30', 'i' => 2.4, 'p' => [-5, -3, -5]],
            'amb' => ['top' => '#e0a468', 'bottom' => '#341c0a', 'i' => 2.0],
        ],
        'cold' => [
            'label' => 'Cold star',
            'sky' => '#0b2e4c', 'haze' => '#07182a',
            'sun' => ['f' => '#dcefff', 'i' => 5.6, 'p' => [5, 6, 5]],
            'rim' => ['f' => '#2a86b8', 'i' => 1.6, 'p' => [-6, -2, -6]],
            'amb' => ['top' => '#6a9cc8', 'bottom' => '#0e1c2a', 'i' => 1.5],
        ],
        'nebula' => [
            'label' => 'Nebula',
            'sky' => '#33225a', 'haze' => '#1d1533',
            'sun' => ['f' => '#e8ccff', 'i' => 4.0, 'p' => [3, 5, 6]],
            'rim' => ['f' => '#ff8fbc', 'i' => 2.0, 'p' => [-5, -2, -4]],
            'amb' => ['top' => '#a488dd', 'bottom' => '#2c2044', 'i' => 2.4],
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
