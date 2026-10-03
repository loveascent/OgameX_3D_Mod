// Sprache des Logins: Deutsch oder Englisch, ein Schalter DE | EN, gemerkt im Browser. Vorgabe: Browsersprache.
// Übersetzt die Original-Texte der Seite an Ort und Stelle (englisches Original wird gemerkt, Rückschalten ist verlustfrei).
import { MOD, SEITE, MUSTER } from './texte.js';

const KEY = 'login3d.sprache';

export function sprache() {
	try { const s = localStorage.getItem(KEY); if (s === 'de' || s === 'en') return s; } catch { /* privat */ }
	return (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
}
export function setzeSprache(s) { try { localStorage.setItem(KEY, s); } catch { /* privat */ } }

/** Eigener Text nach Schlüssel in der gewählten Sprache. */
export function t(schluessel, s = sprache()) { const e = MOD[schluessel]; return e ? (e[s] ?? e.en) : schluessel; }

const norm = (x) => x.replace(/\s+/g, ' ').trim();
const ORIG = new WeakMap();

function uebersetzeText(en, s) {
	const tabelle = SEITE[s]; if (!tabelle) return null;
	if (en in tabelle) return tabelle[en];
	for (const [re, ers] of MUSTER[s] ?? []) if (re.test(en)) return en.replace(re, ers);
	return null;
}

/** Übersetzt alles unterhalb von `wurzel` (Text, Schaltflächen-Beschriftung, Auswahllisten) in Sprache s. */
export function uebersetze(wurzel, s = sprache()) {
	const lauf = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
	for (let n = lauf.nextNode(); n; n = lauf.nextNode()) {
		if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
		if (!ORIG.has(n)) { const o = norm(n.nodeValue); if (!o) continue; ORIG.set(n, { en: o, roh: n.nodeValue }); }
		const { en, roh } = ORIG.get(n);
		const de = s === 'en' ? null : uebersetzeText(en, s);
		if (s === 'en') n.nodeValue = roh;
		else if (de !== null) n.nodeValue = roh.match(/^\s*/)[0] + de + roh.match(/\s*$/)[0];
	}
	wurzel.querySelectorAll('input[type=submit]').forEach((e) => {
		if (!ORIG.has(e)) ORIG.set(e, { en: e.value });
		const o = ORIG.get(e).en, de = s === 'en' ? null : uebersetzeText(o, s);
		e.value = de ?? o;
	});
}

/** Hält die Übersetzung aktuell, auch wenn die Seite Inhalte nachlädt (Reiter „Über OGame“ …). */
export function beobachte(wurzel) {
	let wartet = false;
	new MutationObserver(() => {
		if (wartet || sprache() === 'en') return; wartet = true;
		queueMicrotask(() => { wartet = false; uebersetze(wurzel); });
	}).observe(wurzel, { childList: true, subtree: true });
}
