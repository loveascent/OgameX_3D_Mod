// Blättern statt Scrollen: Mausrad, Wischen, Tasten und Punkte wechseln das Kapitel.
//   Mausrad:  Ausschläge werden gesammelt; ab SCHWELLE (px) ein Kapitel weiter. Danach ist das Rad gesperrt, bis es
//             RUHE ms still war (Trägheits-Scrollen von Touchpads liefert sonst ein Dutzend Ausschläge = viele Kapitel).
//   Wischen:  senkrecht mindestens 50 px und deutlich senkrechter als waagerecht.
//   Tasten:   ↓ / Bild↓ / Leertaste weiter, ↑ / Bild↑ zurück, Pos1 / Ende.
//   Adresse:  #kapitel-id (Lesezeichen, Teilen); Zurück-Taste des Browsers springt zurück.
// Elemente mit eigener Scrollleiste (lange Texte auf kleinen Bildschirmen) scrollen zuerst selbst.
const SCHWELLE = 60, RUHE = 220;

export function erstelleBlaettern({ anzahl, ids, beiWechsel, punkteWirt }) {
	let i = Math.max(0, ids.indexOf(location.hash.slice(1))), summe = 0, gesperrt = false, ruheId = 0;
	const punkte = ids.map((id, k) => {
		const b = document.createElement('button');
		b.type = 'button'; b.className = 'punkt'; b.setAttribute('aria-label', `Kapitel ${k + 1}: ${id}`);
		b.addEventListener('click', () => gehe(k));
		punkteWirt.append(b);
		return b;
	});

	function gehe(k, ohneVerlauf = false) {
		k = Math.max(0, Math.min(anzahl - 1, k));
		if (k === i && !ohneVerlauf) return;
		i = k;
		punkte.forEach((p, n) => p.setAttribute('aria-current', String(n === i)));
		if (!ohneVerlauf) history.pushState(null, '', '#' + ids[i]);
		beiWechsel(i);
	}
	const kannSelbstScrollen = (ziel, dy) => {
		for (let e = ziel; e && e !== document.body; e = e.parentElement) {
			if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))
				if ((dy > 0 && e.scrollTop + e.clientHeight < e.scrollHeight - 1) || (dy < 0 && e.scrollTop > 0)) return true;
		}
		return false;
	};

	addEventListener('wheel', (e) => {
		if (kannSelbstScrollen(e.target, e.deltaY)) return;
		e.preventDefault();
		clearTimeout(ruheId);
		ruheId = setTimeout(() => { gesperrt = false; summe = 0; }, RUHE);
		if (gesperrt) return;
		summe += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
		if (Math.abs(summe) >= SCHWELLE) { gesperrt = true; gehe(i + Math.sign(summe)); summe = 0; }
	}, { passive: false });

	let start = null;
	addEventListener('touchstart', (e) => { start = { x: e.touches[0].clientX, y: e.touches[0].clientY, ziel: e.target }; }, { passive: true });
	addEventListener('touchend', (e) => {
		if (!start) return;
		const dx = e.changedTouches[0].clientX - start.x, dy = e.changedTouches[0].clientY - start.y;
		if (Math.abs(dy) > 50 && Math.abs(dy) > 1.5 * Math.abs(dx) && !kannSelbstScrollen(start.ziel, -dy)) gehe(i + (dy < 0 ? 1 : -1));
		start = null;
	}, { passive: true });

	addEventListener('keydown', (e) => {
		if (e.target.closest?.('input, textarea, select')) return;
		const k = { ArrowDown: 1, PageDown: 1, ' ': 1, ArrowUp: -1, PageUp: -1 }[e.key];
		if (k) { e.preventDefault(); gehe(i + k); }
		else if (e.key === 'Home') gehe(0);
		else if (e.key === 'End') gehe(anzahl - 1);
	});
	addEventListener('popstate', () => gehe(Math.max(0, ids.indexOf(location.hash.slice(1))), true));

	setTimeout(() => gehe(i, true));
	return { get index() { return i; }, gehe };
}
