{{--
    The 3D Mod admin screen.

    It extends the game's own ingame layout, so it inherits the frame, the fonts and
    the admin bar without reproducing any of them. Everything it adds is namespaced
    under .ogx3d- so it cannot reach anything else on the page.
--}}
@extends('ingame.layouts.main')

@section('content')

<style>
    .ogx3d-wrap { padding: 12px 16px 60px; color: #cbd6e2; }
    .ogx3d-wrap h2 { color: #f48406; font-size: 15px; margin: 0 0 10px; }
    .ogx3d-wrap h3 { color: #9fc0e8; font-size: 12px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: .06em; }
    .ogx3d-panel { background: rgba(8, 16, 26, .72); border: 1px solid #26364a; border-radius: 4px; padding: 12px 14px; margin-bottom: 14px; }
    .ogx3d-note { color: #8fa2b8; font-size: 11px; line-height: 1.6; }
    .ogx3d-note code { color: #d8e6a0; background: rgba(0,0,0,.4); padding: 1px 4px; border-radius: 2px; }
    .ogx3d-msg { padding: 8px 12px; border-radius: 3px; margin-bottom: 12px; font-size: 12px; }
    .ogx3d-msg.ok { background: #1d3a22; border: 1px solid #3c7a45; color: #b9e6c0; }
    .ogx3d-msg.bad { background: #3a1d1d; border: 1px solid #7a3c3c; color: #e6b9b9; }

    .ogx3d-versions { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
    .ogx3d-ver { border: 1px solid #26364a; border-radius: 4px; padding: 8px 10px; min-width: 168px; background: rgba(0,0,0,.25); }
    .ogx3d-ver.editing { border-color: #f48406; }
    .ogx3d-ver .k { color: #fff; font-weight: bold; font-size: 13px; }
    .ogx3d-ver .l { color: #8fa2b8; font-size: 11px; display: block; margin: 2px 0 6px; }
    .ogx3d-ver .tags { margin-bottom: 6px; }
    .ogx3d-tag { display: inline-block; font-size: 10px; padding: 1px 5px; border-radius: 2px; margin-right: 4px; }
    .ogx3d-tag.live { background: #3c7a45; color: #fff; }
    .ogx3d-tag.you { background: #2b5580; color: #fff; }
    .ogx3d-ver form { display: inline; }

    .ogx3d-btn { background: #333; color: #fff; border: 1px solid #4a4a4a; border-radius: 3px; padding: 3px 9px; font-size: 11px; cursor: pointer; }
    .ogx3d-btn:hover { background: #555; }
    .ogx3d-btn.go { background: #2b5580; border-color: #3c74ad; }
    .ogx3d-btn.add { background: #3c7a45; border-color: #4f9c5b; font-weight: bold; }
    .ogx3d-btn.warn { background: #6b2f2f; border-color: #8f4141; }

    .ogx3d-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
    .ogx3d-card { border: 1px solid #26364a; border-radius: 4px; background: rgba(0,0,0,.28); padding: 8px; }
    .ogx3d-card.set { border-color: #4f9c5b; }
    .ogx3d-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .ogx3d-shot { width: 46px; height: 46px; flex: 0 0 46px; background: #0b1420 center/contain no-repeat; border: 1px solid #26364a; border-radius: 3px; }
    .ogx3d-name { font-size: 12px; color: #fff; line-height: 1.25; }
    .ogx3d-key { font-size: 10px; color: #7d8fa6; }
    .ogx3d-card label { display: block; font-size: 10px; color: #8fa2b8; margin: 5px 0 1px; }
    .ogx3d-card select, .ogx3d-card input[type=text], .ogx3d-card input[type=number], .ogx3d-card input[type=file] {
        width: 100%; box-sizing: border-box; background: #0d1620; color: #cbd6e2;
        border: 1px solid #2c3d52; border-radius: 3px; padding: 3px 4px; font-size: 11px;
    }
    .ogx3d-row { display: flex; gap: 6px; }
    .ogx3d-row > * { flex: 1; min-width: 0; }
    .ogx3d-actions { margin-top: 7px; display: flex; gap: 5px; }
    .ogx3d-now { font-size: 10px; color: #8bc48b; margin-top: 4px; word-break: break-all; }
    .ogx3d-filter { width: 260px; background: #0d1620; color: #cbd6e2; border: 1px solid #2c3d52; border-radius: 3px; padding: 4px 6px; font-size: 12px; }
    .ogx3d-hide { display: none !important; }
</style>

<div id="alliancecomponent" class="maincontent">
<div class="ogx3d-wrap">

    <h2>OgameX 3D Mod</h2>

    @if (session('success'))
        <div class="ogx3d-msg ok">{{ session('success') }}</div>
    @endif
    @if (session('error'))
        <div class="ogx3d-msg bad">{{ session('error') }}</div>
    @endif

    @unless ($ready)
        <div class="ogx3d-msg bad">
            The mod's database tables are missing. Run <code>php artisan migrate</code> once, then reload this page.
        </div>
    @endunless

    {{-- ==============================================================
         Versions
         ============================================================== --}}

    <div class="ogx3d-panel">
        <h3>Graphics versions</h3>
        <p class="ogx3d-note">
            <strong>V1 is the original game and can never be changed.</strong> Every other version is a
            separate, initially empty layer over it: what you assign in one version is invisible in all
            the others. <em>Live</em> is what every player sees; <em>Preview</em> switches only this
            browser, so you can look at a version before handing it to the server.
        </p>

        <div class="ogx3d-versions" style="margin-top:10px;">
            @foreach ($versions as $key => $label)
                <div class="ogx3d-ver {{ $key === $editing ? 'editing' : '' }}">
                    <span class="k">{{ strtoupper($key) }}</span>
                    <span class="l">{{ $label }}</span>
                    <div class="tags">
                        @if ($key === $server_default)<span class="ogx3d-tag live">LIVE</span>@endif
                        @if ($key === $looking_at)<span class="ogx3d-tag you">you see this</span>@endif
                    </div>

                    @if ($key !== $server_default)
                        <form method="POST" action="{{ route('ogx3d.admin.version.activate') }}">
                            @csrf
                            <input type="hidden" name="version" value="{{ $key }}">
                            <button class="ogx3d-btn go" type="submit"
                                    onclick="return confirm('Every player will see {{ strtoupper($key) }}. Continue?');">Make live</button>
                        </form>
                    @endif

                    @if ($key !== $looking_at)
                        <form method="POST" action="{{ route('ogx3d.admin.version.preview') }}">
                            @csrf
                            <input type="hidden" name="version" value="{{ $key }}">
                            <button class="ogx3d-btn" type="submit">Preview</button>
                        </form>
                    @endif

                    @if ($key !== 'v1')
                        <a class="ogx3d-btn" style="text-decoration:none;display:inline-block;"
                           href="{{ route('ogx3d.admin.index', ['v' => $key]) }}">Edit</a>
                        <form method="POST" action="{{ route('ogx3d.admin.version.delete') }}">
                            @csrf
                            <input type="hidden" name="version" value="{{ $key }}">
                            <button class="ogx3d-btn warn" type="submit"
                                    onclick="return confirm('Delete {{ strtoupper($key) }} and everything assigned to it?');">Delete</button>
                        </form>
                    @endif
                </div>
            @endforeach

            <div class="ogx3d-ver" style="border-style:dashed;">
                <form method="POST" action="{{ route('ogx3d.admin.version.add') }}">
                    @csrf
                    <span class="k">+</span>
                    <span class="l">Add the next version</span>
                    <input type="text" name="label" placeholder="Name (optional)"
                           style="width:100%;box-sizing:border-box;background:#0d1620;color:#cbd6e2;border:1px solid #2c3d52;border-radius:3px;padding:3px 4px;font-size:11px;margin-bottom:6px;">
                    <button class="ogx3d-btn add" type="submit">+ New version</button>
                </form>
            </div>
        </div>

        @if ($editing !== null)
            <div style="margin-top:10px;">
                <form method="POST" action="{{ route('ogx3d.admin.version.rename') }}" style="display:inline-block;margin-right:12px;">
                    @csrf
                    <input type="hidden" name="version" value="{{ $editing }}">
                    <input type="text" name="label" value="{{ $versions[$editing] ?? '' }}" maxlength="64"
                           style="width:220px;background:#0d1620;color:#cbd6e2;border:1px solid #2c3d52;border-radius:3px;padding:3px 5px;font-size:11px;">
                    <button class="ogx3d-btn" type="submit">Rename {{ strtoupper($editing) }}</button>
                </form>

                <form method="POST" action="{{ route('ogx3d.admin.version.copy') }}" style="display:inline-block;">
                    @csrf
                    <input type="hidden" name="to" value="{{ $editing }}">
                    <select name="from" style="background:#0d1620;color:#cbd6e2;border:1px solid #2c3d52;border-radius:3px;padding:3px 5px;font-size:11px;">
                        @foreach ($versions as $key => $label)
                            @if ($key !== 'v1' && $key !== $editing)
                                <option value="{{ $key }}">{{ strtoupper($key) }}</option>
                            @endif
                        @endforeach
                    </select>
                    <button class="ogx3d-btn" type="submit">Copy everything into {{ strtoupper($editing) }}</button>
                </form>
            </div>
        @endif
    </div>

    @if ($editing === null)
        <div class="ogx3d-panel">
            <p class="ogx3d-note">
                There is no version to edit yet. Press <strong>+ New version</strong> above; it will be
                created empty, so it looks exactly like V1 until you give something a new picture or a model.
            </p>
        </div>
    @else

    {{-- ==============================================================
         The drop folders
         ============================================================== --}}

    <div class="ogx3d-panel">
        <h3>Your files</h3>
        <p class="ogx3d-note">
            Put <code>.glb</code> / <code>.gltf</code> models in <code>public/{{ $model_dir }}/</code>
            and replacement icons in <code>public/{{ $icon_dir }}/</code>. They appear in the drop-downs
            below straight away - no restart, no cache to clear.
            Found now: <strong>{{ count($models) }}</strong> model(s), <strong>{{ count($icons) }}</strong> icon(s).
        </p>
        <form method="POST" action="{{ route('ogx3d.admin.upload') }}" enctype="multipart/form-data" style="margin-top:8px;">
            @csrf
            <input type="hidden" name="version" value="{{ $editing }}">
            <input type="file" name="file" accept=".glb,.gltf,.png,.jpg,.jpeg,.gif,.webp"
                   style="background:#0d1620;color:#cbd6e2;border:1px solid #2c3d52;border-radius:3px;padding:3px 5px;font-size:11px;">
            <button class="ogx3d-btn" type="submit">Add to folder</button>
            <span class="ogx3d-note">- if you cannot reach the server's files, upload here instead.</span>
        </form>
    </div>

    {{-- ==============================================================
         The assignments
         ============================================================== --}}

    <div class="ogx3d-panel">
        <h3>Editing {{ strtoupper($editing) }} - {{ $versions[$editing] ?? '' }}</h3>
        <p class="ogx3d-note">
            A <strong>picture</strong> replaces that object's icon on every screen at once - shipyard,
            fleet, tech tree, build queue, battle report.
            A <strong>model</strong> puts a live, rotatable 3D view in the large artwork box of the
            detail panel. You can set both: the model is shown where there is room for it, the picture
            everywhere else.
        </p>
        <div style="margin-top:8px;">
            <input class="ogx3d-filter" id="ogx3d-filter" type="text" placeholder="Filter by name...">
            <form method="POST" action="{{ route('ogx3d.admin.rebuild') }}" style="display:inline-block;margin-left:8px;">
                @csrf
                <input type="hidden" name="version" value="{{ $editing }}">
                <button class="ogx3d-btn" type="submit">Rebuild stylesheet</button>
            </form>
        </div>
    </div>

    @php
        $cards = ['Interface slots' => $slots] + $groups;
    @endphp

    @foreach ($cards as $groupName => $items)
        @continue(count($items) === 0)
        <h3>{{ $groupName }}</h3>
        <div class="ogx3d-grid">
            @foreach ($items as $item)
                <div class="ogx3d-card {{ $item['assigned'] ? 'set' : '' }}" data-name="{{ strtolower($item['title'] . ' ' . $item['target']) }}">
                    <form method="POST" action="{{ route('ogx3d.admin.assign') }}" enctype="multipart/form-data">
                        @csrf
                        <input type="hidden" name="version" value="{{ $editing }}">
                        <input type="hidden" name="target" value="{{ $item['target'] }}">

                        <div class="ogx3d-head">
                            {{-- The game's OWN element, so the thumbnail is whatever the game
                                 currently paints - original crop or override - without this page
                                 having to know which. --}}
                            @if (!empty($item['preview_classes']))
                                <span class="ogx3d-shot {{ $item['preview_classes'] }}" style="background-size:contain;"></span>
                            @elseif (!empty($item['image']))
                                <span class="ogx3d-shot" style="background-image:url('{{ asset($item['image']) }}');"></span>
                            @else
                                <span class="ogx3d-shot"></span>
                            @endif
                            <div>
                                <div class="ogx3d-name">{{ $item['title'] }}</div>
                                <div class="ogx3d-key">{{ $item['target'] }}@if ($item['selector_count']) &middot; {{ $item['selector_count'] }} selectors @endif</div>
                            </div>
                        </div>

                        <label>Picture from {{ $icon_dir }}</label>
                        <select name="image">
                            <option value="">- unchanged -</option>
                            @foreach ($icons as $icon)
                                <option value="{{ $icon }}" @selected($item['image'] === $icon)>{{ basename($icon) }}</option>
                            @endforeach
                        </select>

                        <label>...or upload one now</label>
                        <input type="file" name="image_file" accept="image/*">

                        <label>3D model from {{ $model_dir }}</label>
                        <select name="model">
                            <option value="">- none -</option>
                            @foreach ($models as $model)
                                <option value="{{ $model }}" @selected($item['model'] === $model)>{{ basename($model) }}</option>
                            @endforeach
                        </select>

                        <div class="ogx3d-row">
                            <div>
                                <label>Lighting</label>
                                <select name="preset">
                                    @foreach ($presets as $key => $label)
                                        <option value="{{ $key }}" @selected($item['preset'] === $key)>{{ $label }}</option>
                                    @endforeach
                                </select>
                            </div>
                            <div>
                                <label>Movement</label>
                                <select name="motion">
                                    <option value="">- default -</option>
                                    <option value="hover" @selected($item['motion'] === 'hover')>Drift</option>
                                    <option value="spin" @selected($item['motion'] === 'spin')>Turn</option>
                                    <option value="still" @selected($item['motion'] === 'still')>Still</option>
                                </select>
                            </div>
                        </div>

                        <div class="ogx3d-row">
                            <div>
                                <label>Speed</label>
                                <input type="number" name="spin" step="0.1" min="0" max="20"
                                       value="{{ $item['spin'] }}" placeholder="1">
                            </div>
                            <div>
                                <label>Framing</label>
                                <input type="number" name="zoom" step="0.05" min="0.2" max="5"
                                       value="{{ $item['zoom'] }}" placeholder="1">
                            </div>
                        </div>

                        @if ($item['image'])
                            <div class="ogx3d-now">picture: {{ basename($item['image']) }}</div>
                        @endif
                        @if ($item['model'])
                            <div class="ogx3d-now">model: {{ basename($item['model']) }}</div>
                        @endif

                        <div class="ogx3d-actions">
                            <button class="ogx3d-btn go" type="submit">Save</button>
                            @if ($item['assigned'])
                                {{-- formaction, not a second <form>: a form inside a form is
                                     discarded by the html parser, and the inner button then
                                     silently submits the OUTER form instead. --}}
                                <button class="ogx3d-btn warn" type="submit"
                                        formaction="{{ route('ogx3d.admin.reset') }}"
                                        formenctype="application/x-www-form-urlencoded">Back to original</button>
                            @endif
                        </div>
                    </form>
                </div>
            @endforeach
        </div>
    @endforeach

    @endif

</div>
</div>

<script>
    // Filter box. Plain substring over a data attribute php already lower-cased - no
    // library, and nothing that can outlive this page.
    (function () {
        var box = document.getElementById('ogx3d-filter');
        if (!box) { return; }
        box.addEventListener('input', function () {
            var q = box.value.trim().toLowerCase();
            document.querySelectorAll('.ogx3d-card').forEach(function (card) {
                card.classList.toggle('ogx3d-hide', q !== '' && card.dataset.name.indexOf(q) === -1);
            });
        });
    })();
</script>

@endsection
