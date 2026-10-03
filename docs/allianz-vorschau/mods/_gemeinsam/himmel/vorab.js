// Klassisches Skript, steht im <head> VOR dem ersten Zeichnen (siehe Mods login3d und ogx-render).
// Unterdrückt den alten Seitenhintergrund (background-large.jpg) und zeigt sofort das Standbild des letzten Himmels
// (stand.js) bzw. ein ruhiges Dunkelblau - so gibt es beim Seitenwechsel weder das alte Bild noch ein Aufblitzen.
(function () {
	var bild = '';
	try { var j = JSON.parse(sessionStorage.getItem('ogx.himmel')); if (j && j.bild) bild = j.bild; } catch (e) { /* privat */ }
	var s = document.createElement('style');
	s.id = 'ogx-himmel-vorab';
	s.textContent = 'html{background:#02050b' + (bild ? ' url(' + bild + ') center/cover no-repeat fixed' : '') + '}'
		+ 'body.ogx-himmel,body.ogx-himmel #bg{background-image:none!important;background-color:transparent!important}';
	document.head.appendChild(s);
	// body existiert noch nicht: Klasse setzen, sobald er da ist (vor dem ersten Zeichnen)
	var mo = new MutationObserver(function () { if (document.body) { document.body.classList.add('ogx-himmel'); mo.disconnect(); } });
	mo.observe(document.documentElement, { childList: true });
})();
