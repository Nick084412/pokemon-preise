/* Pokémon-Kartenpreise – Markt, Beobachtung, Portfolio, Suche, Verlauf und Ausblick */
"use strict";

const API = "https://api.tcgdex.net/v2";
const EBAY_KAT = "183454";
const TAG = 86400000;
const SPEICHER = "pk-portfolios";
let daten = { karten: [] };      // beobachtete Karten (daten.json)
let markt = null;                // markt/uebersicht.json

const $ = (s, w = document) => w.querySelector(s);
const $$ = (s, w = document) => [...w.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (x, ziffern) => (x == null || isNaN(x) ? "–" : x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: ziffern ?? (Math.abs(x) < 100 ? 2 : 0), minimumFractionDigits: ziffern ?? (Math.abs(x) < 100 ? 2 : 0) }));
const usd = (x) => (x == null ? "–" : x.toLocaleString("de-DE", { style: "currency", currency: "USD" }));
const datum = (d) => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const prozent = (x) => (x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : "") + x.toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %");
const heuteISO = () => new Date().toISOString().slice(0, 10);
const bildKlein = (b) => (b ? (b.endsWith(".webp") ? b.replace("high.webp", "low.webp") : b + "/low.webp") : "");
const bildGross = (b) => (b ? (b.endsWith(".webp") ? b : b + "/high.webp") : "");

const _cache = new Map();
async function holeJson(url, frisch) {
  if (!frisch && _cache.has(url)) return _cache.get(url);
  const p = fetch(frisch ? url + (url.includes("?") ? "&" : "?") + Date.now() : url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  _cache.set(url, p);
  p.catch(() => _cache.delete(url));
  return p;
}

document.addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.style.visibility = "hidden"; }, true);

/* ================================================================== Navigation */
const SEITEN = ["markt", "beobachtet", "portfolio"];
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith("import=")) { importiereLink(h.slice(7)); return; }
  const seite = SEITEN.find((s) => h === s || h.startsWith(s + "-")) || "markt";
  $$(".seite").forEach((el) => (el.hidden = el.dataset.seite !== seite));
  $$(".menue summary").forEach((s) => s.classList.toggle("aktiv", s.dataset.bereich === seite));
  $$(".menue").forEach((m) => (m.open = false));
  if (seite === "portfolio") zeigePortfolio();
  const ziel = h && document.getElementById(h);
  if (ziel && ziel.tagName === "DETAILS") { ziel.open = true; ziel.scrollIntoView({ behavior: "smooth", block: "start" }); }
  else window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", route);
// Menü: Klick auf einen Bereich öffnet dessen Liste, Klick daneben schließt alle
$$(".menue").forEach((m) => m.addEventListener("toggle", () => { if (m.open) $$(".menue").forEach((x) => x !== m && (x.open = false)); }));
document.addEventListener("click", (e) => { if (!e.target.closest(".menue")) $$(".menue").forEach((m) => (m.open = false)); });
$$(".menue-liste a").forEach((a) => a.addEventListener("click", () => { if (location.hash === a.getAttribute("href")) route(); }));

$("#thema").addEventListener("click", () => {
  const html = document.documentElement;
  const neu = html.dataset.theme === "light" ? "dark" : "light";
  html.dataset.theme = neu;
  try { localStorage.setItem("pk-thema", neu); } catch (e) {}
});

/* ================================================================== Markt */
function kachel(k, zeilen) {
  return `<button class="karte" type="button" data-id="${esc(k.id)}">
    <img src="${esc(bildKlein(k.bild))}" alt="${esc(k.name)}" loading="lazy">
    <span class="titel">${esc(k.name)}</span>
    <span class="unter">${esc(k.set)} · ${esc(k.nummer)}</span>
    ${zeilen.map(([l, w, cls]) => `<span class="preiszeile"><span>${l}</span><b class="${cls || ""}">${w}</b></span>`).join("")}
  </button>`;
}
const klickbar = (wurzel) => $$("[data-id]", wurzel).forEach((b) => b.addEventListener("click", () => oeffne(b.dataset.id)));

async function ladeMarkt() {
  try { markt = await holeJson("markt/uebersicht.json", true); }
  catch (e) { $("#begehrt").innerHTML = '<p class="hinweis">Die Marktdaten werden gerade zum ersten Mal erstellt.</p>'; return; }
  $("#markt-stand").textContent = `Stand ${new Date(markt.stand).toLocaleDateString("de-DE")} · ${markt.karten_gesamt.toLocaleString("de-DE")} Karten ausgewertet`;
  $("#begehrt").innerHTML = markt.begehrt.map((k) => kachel(k, [
    ["Cardmarket", eur(k.trend)],
    ["Ø verkauft 7 T.", eur(k.avg7)],
    ["30 Tage", prozent(k.avg30 ? (k.avg7 / k.avg30 - 1) * 100 : null), k.avg7 >= k.avg30 ? "plus" : "minus"],
  ])).join("");
  klickbar($("#begehrt"));
  zeigeBewegung();
}
$("#zeitraum").addEventListener("change", zeigeBewegung);

function zeigeBewegung() {
  if (!markt) return;
  const b = markt.bewegung[$("#zeitraum").value];
  const zeile = (k) => `<li><button type="button" data-id="${esc(k.id)}">
    <img src="${esc(bildKlein(k.bild))}" alt="" loading="lazy">
    <span class="n">${esc(k.name)}<small>${esc(k.set)} · ${esc(k.nummer)}</small></span>
    <span class="w"><b class="${k.aenderung >= 0 ? "plus" : "minus"}">${prozent(k.aenderung)}</b>${eur(k.trend)}</span></button></li>`;
  $("#gewinner").innerHTML = b.gewinner.map(zeile).join("") || '<li class="hinweis">Keine Daten</li>';
  $("#verlierer").innerHTML = b.verlierer.map(zeile).join("") || '<li class="hinweis">Keine Daten</li>';
  const ersatz = [...b.gewinner, ...b.verlierer].some((k) => k.quelle !== "Verlauf");
  $("#bewegung-info").textContent = `Karten ab ${eur(markt.min_preis_listen, 0)}. ` + (ersatz
    ? ($("#zeitraum").value === "7" ? "Vergleich: Ø Verkaufspreis gestern gegenüber dem 7-Tage-Schnitt (bis der eigene Verlauf 7 Tage alt ist)." : "Vergleich: Ø Verkaufspreis 7 Tage gegenüber dem 30-Tage-Schnitt (bis der eigene Verlauf 30 Tage alt ist).")
    : "Vergleich des Cardmarket-Trendpreises mit dem aufgezeichneten Verlauf.");
  klickbar($("#gewinner")); klickbar($("#verlierer"));
}

/* ================================================================== Beobachtet */
async function ladeBeobachtet() {
  try { daten = await holeJson("daten.json", true); }
  catch (e) { $("#liste").innerHTML = '<p class="hinweis">Noch keine Daten.</p>'; return; }
  $("#rabatt").textContent = daten.rabatt_prozent ?? 20;
  $("#stand").textContent = `Stand ${new Date(daten.stand).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} · eBay ${daten.ebay_aktiv ? "aktiv" : "noch nicht eingerichtet"}`;
  $("#liste").innerHTML = daten.karten.map((k) => {
    const cm = k.cardmarket || {};
    const ebayMin = (k.ebay?.angebote || []).find((a) => a.art === "Sofort-Kaufen")?.gesamt;
    const v = cm.avg30 && cm.trend ? (cm.trend / cm.avg30 - 1) * 100 : null;
    return kachel({ ...k, nummer: k.nummer + (k.nummerOffiziell ? "/" + k.nummerOffiziell : "") }, [
      ["Cardmarket", eur(cm.trend)], ["eBay ab", ebayMin ? eur(ebayMin) : "–"], ["30 Tage", prozent(v), v >= 0 ? "plus" : "minus"],
    ]).replace("</button>", k.deals?.length ? `<span class="marke">${k.deals.length} günstig</span></button>` : "</button>");
  }).join("") || '<p class="hinweis">Noch keine Karten in der Beobachtungsliste.</p>';
  const deals = daten.karten.flatMap((k) => (k.deals || []).map((d) => ({ k, d })));
  $("#deals").innerHTML = deals.slice(0, 10).map(({ k, d }) => `
    <a class="deal" href="${esc(d.url)}" target="_blank" rel="noopener">
      ${k.bild ? `<img src="${esc(bildKlein(k.bild))}" alt="">` : ""}
      <div><b>${esc(k.name)}</b> · ${esc(k.set)}<br><span class="klein">${esc(d.grund)}${d.warnung ? ' · <span class="marke warn">Fake/Betrug prüfen</span>' : ""}<br>${esc(d.titel)}</span></div>
      <span class="preis num">${eur(d.gesamt)}</span>
    </a>`).join("") || `<p class="hinweis">Gerade kein Angebot unter Wunschpreis.${daten.ebay_aktiv ? "" : " Sobald eBay eingerichtet ist, erscheinen hier auch eBay-Angebote."}</p>`;
  klickbar($("#liste"));
}

/* ================================================================== Suche */
$("#suche").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const q = $("#eingabe").value.trim();
  if (q.length < 2) return;
  $("#bereich-suche").hidden = false;
  $("#treffer").innerHTML = "";
  $("#suche-status").textContent = "Suche …";
  $("#bereich-suche").scrollIntoView({ behavior: "smooth" });
  try {
    let treffer = await holeJson(`${API}/de/cards?name=${encodeURIComponent(q)}&pagination:itemsPerPage=60`);
    if (!treffer.length) treffer = await holeJson(`${API}/en/cards?name=${encodeURIComponent(q)}&pagination:itemsPerPage=60`);
    treffer = treffer.filter((t) => t.image).reverse();
    $("#suche-status").textContent = treffer.length ? `${treffer.length} Karten gefunden. Tippe eine an für Preise und „Ins Portfolio“.` : "Keine Karte gefunden. Versuch den deutschen oder englischen Namen ohne Zusatz wie „ex“.";
    $("#treffer").innerHTML = treffer.map((t) => `<button class="karte" type="button" data-id="${esc(t.id)}">
      <img src="${esc(t.image)}/low.webp" alt="${esc(t.name)}" loading="lazy">
      <span class="titel">${esc(t.name)}</span><span class="unter">${esc(t.id)}</span></button>`).join("");
    klickbar($("#treffer"));
  } catch (e) {
    $("#suche-status").textContent = "Die Suche ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.";
  }
});
$("#suche-zu").addEventListener("click", () => { $("#bereich-suche").hidden = true; });

/* ================================================================== Kartendaten & Verlauf */
async function holeKarteLive(id) {
  const k = await holeJson(`${API}/de/cards/${encodeURIComponent(id)}`);
  let set = {};
  try { set = await holeJson(`${API}/de/sets/${encodeURIComponent(k.set.id)}`); } catch (e) {}
  const cm = k.pricing?.cardmarket || {};
  const tpv = Object.values(k.pricing?.tcgplayer || {}).find((v) => v && typeof v === "object" && v.marketPrice) || {};
  const pos = (x) => (typeof x === "number" && x > 0 ? x : null);
  return {
    id: k.id, name: k.name, set: k.set.name, setId: k.set.id, nummer: k.localId,
    nummerOffiziell: k.set.cardCount?.official, seltenheit: k.rarity || "",
    bild: k.image ? k.image + "/high.webp" : null, release: set.releaseDate || null,
    cardmarket: { trend: pos(cm.trend), ab: pos(cm.low), avg1: pos(cm.avg1), avg7: pos(cm.avg7), avg30: pos(cm.avg30), stand: cm.updated },
    tcgplayer_usd: pos(tpv.marketPrice),
  };
}

/* Verlauf einer Karte: zuerst aus der Beobachtung (mit eBay), sonst aus dem täglichen Markt-Abruf */
async function holeVerlauf(id, setId) {
  if (daten.karten.some((k) => k.id === id)) {
    try {
      const v = await holeJson(`verlauf/${encodeURIComponent(id)}.json`);
      return v.punkte.filter((p) => p.trend).map((p) => ({ ...p, t: +new Date(p.datum) }));
    } catch (e) {}
  }
  if (!setId) setId = id.slice(0, id.lastIndexOf("-"));
  try {
    const s = await holeJson(`markt/verlauf/${encodeURIComponent(setId)}.json`);
    const e = s.karten[id];
    if (e) return e.p.map(([d, trend, avg1, gesch]) => ({ datum: d, t: +new Date(d), trend, avg1, geschaetzt: !!gesch }));
  } catch (e) {}
  return null;
}

function punkteAusDurchschnitt(cm) {
  const heute = new Date(); heute.setUTCHours(0, 0, 0, 0);
  const p = [];
  const add = (tage, wert) => wert && p.push({ t: +heute - tage * TAG, datum: new Date(+heute - tage * TAG).toISOString().slice(0, 10), trend: wert, geschaetzt: true });
  add(15, cm.avg30); add(4, cm.avg7);
  if (cm.trend) p.push({ t: +heute, datum: heute.toISOString().slice(0, 10), trend: cm.trend, avg1: cm.avg1 });
  return p;
}

/* Marktwert je Tag: Mittel aus Trendpreis und Ø Verkaufspreis (echte Verkäufe), wenn beides da ist */
const marktwert = (p) => (p.avg1 ? (p.trend + p.avg1) / 2 : p.trend);

/* Gedämpfte log-lineare Fortschreibung (Trend + echte Verkaufspreise): Steigung aus den letzten 180 Tagen,
   jeder weitere Tag wirkt etwas schwächer (φ = 0,985), Spanne wächst mit der Zeit. */
function prognose(punkte, cm) {
  if (punkte.length < 2) return null;
  const ende = punkte[punkte.length - 1];
  const basis = punkte.filter((p) => p.t >= ende.t - 180 * TAG);
  const xs = basis.map((p) => (p.t - ende.t) / TAG);
  const ys = basis.map((p) => Math.log(marktwert(p)));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  let steigung = sxx ? sxy / sxx : 0;
  const reste = xs.map((x, i) => ys[i] - (my + steigung * (x - mx)));
  let sigma = Math.sqrt(reste.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2));
  const echt = basis.filter((p) => !p.geschaetzt).length;
  if (echt < 14) {
    // wenig eigener Verlauf → Verkaufsschnitte von Cardmarket (7 vs. 30 Tage) mit einbeziehen, vorsichtiger
    if (cm?.avg7 && cm?.avg30) steigung = (steigung + Math.log(cm.avg7 / cm.avg30) / 18.5) / 2;
    steigung *= 0.5;
  }
  steigung = Math.max(-0.01, Math.min(0.01, steigung));
  sigma = Math.max(sigma, echt < 14 ? 0.06 : 0.03);
  const phi = 0.985, start = Math.log(marktwert(ende));
  const reihe = [];
  let summe = 0;
  for (let h = 0; h <= 90; h++) {
    if (h > 0) summe += phi ** h;
    const mitte = start + steigung * summe;
    const breite = 1.28 * sigma * Math.sqrt(1 + h / 15);
    if (h % 3 === 0 || h === 30 || h === 90) reihe.push({ t: ende.t + h * TAG, wert: Math.exp(mitte), unten: Math.exp(mitte - breite), oben: Math.exp(mitte + breite), h });
  }
  const bei = (h) => reihe.find((r) => r.h === h);
  return { reihe, p30: bei(30), p90: bei(90), tendenz: (bei(90).wert / Math.exp(start) - 1) * 100 };
}

/* Bewertung der Vergangenheit: wo steht der Preis im Vergleich zu den echten Verkäufen? */
function bewertung(punkte, cm) {
  const teile = [];
  if (cm.trend && cm.avg30) {
    const d = (cm.trend / cm.avg30 - 1) * 100;
    const urteil = d > 10 ? "liegt <b>über</b> dem Verkaufsschnitt, eher teuer" : d < -10 ? "liegt <b>unter</b> dem Verkaufsschnitt, eher günstig" : "liegt <b>im Bereich</b> des Verkaufsschnitts, fairer Preis";
    teile.push(`Der aktuelle Trend (${eur(cm.trend)}) ${urteil}: ${prozent(d)} gegenüber dem Ø Verkaufspreis der letzten 30 Tage (${eur(cm.avg30)}).`);
  }
  if (cm.avg7 && cm.avg30) {
    const d = (cm.avg7 / cm.avg30 - 1) * 100;
    teile.push(`Verkäufe der letzten 7 Tage: ${prozent(d)} gegenüber dem 30-Tage-Schnitt, also ${d > 3 ? "steigende" : d < -3 ? "fallende" : "stabile"} Nachfrage.`);
  }
  const echt = punkte.filter((p) => !p.geschaetzt);
  if (echt.length >= 2) {
    const werte = echt.map((p) => p.trend);
    teile.push(`Seit ${datum(echt[0].t)}: ${prozent((werte[werte.length - 1] / werte[0] - 1) * 100)} · Tief ${eur(Math.min(...werte))} · Hoch ${eur(Math.max(...werte))}.`);
  }
  return teile.join("<br>");
}

/* ================================================================== Detail */
const dialog = $("#detail");
$("#detail-zu").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

async function oeffne(id) {
  $("#detail-inhalt").innerHTML = '<p class="hinweis">Lade Live-Preise …</p>';
  if (!dialog.open) dialog.showModal();
  await _beobachtet;
  const beobachtet = daten.karten.find((k) => k.id === id);
  let k;
  try { k = await holeKarteLive(id); }
  catch (e) {
    if (!beobachtet) { $("#detail-inhalt").innerHTML = '<p class="hinweis">Die Preise konnten nicht geladen werden.</p>'; return; }
    k = { ...beobachtet };
  }
  if (beobachtet) Object.assign(k, { ebay: beobachtet.ebay, deals: beobachtet.deals, wunschpreis: beobachtet.wunschpreis });
  const verlauf = await holeVerlauf(id, k.setId);
  zeigeDetail(k, verlauf, !!beobachtet);
}

const suchbegriff = (k) => `${k.name} ${k.nummer}${k.nummerOffiziell ? "/" + k.nummerOffiziell : ""}`;

function zeigeDetail(k, verlauf, beobachtet) {
  const cm = k.cardmarket || {};
  const angebote = k.ebay?.angebote || [];
  const ebayMin = angebote.find((a) => a.art === "Sofort-Kaufen");
  const q = encodeURIComponent(suchbegriff(k));
  const ebaySuche = `https://www.ebay.de/sch/i.html?_nkw=${q}&_sacat=${EBAY_KAT}&_sop=15&LH_BIN=1`;
  const ebayVerkauft = `https://www.ebay.de/sch/i.html?_nkw=${q}&_sacat=${EBAY_KAT}&LH_Sold=1&LH_Complete=1&_sop=13`;
  const cmLink = `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(k.name)}`;
  const preise = [["Cardmarket", cm.trend], ["eBay", ebayMin?.gesamt]].filter((p) => p[1]);
  const bester = preise.length === 2 ? (preise[0][1] <= preise[1][1] ? "Cardmarket" : "eBay") : null;

  const punkte = verlauf?.length ? [...verlauf] : punkteAusDurchschnitt(cm);
  // heutigen Live-Wert anhängen bzw. ersetzen
  const heute = heuteISO();
  if (cm.trend) {
    const letzter = punkte[punkte.length - 1];
    if (letzter && letzter.datum === heute) Object.assign(letzter, { trend: cm.trend, avg1: cm.avg1 ?? letzter.avg1 });
    else punkte.push({ datum: heute, t: +new Date(heute), trend: cm.trend, avg1: cm.avg1 });
  }
  const prog = prognose(punkte, cm);
  const positionen = alleStaende().flatMap((pf) => pf.positionen.filter((p) => p.id === k.id));
  const kaufpreise = positionen.map((p) => p.kaufpreis).filter((x) => x);
  const eintrag = JSON.stringify({ id: k.id, suche: suchbegriff(k), wunschpreis: cm.trend ? Math.round(cm.trend * 0.85) : null });

  $("#detail-inhalt").innerHTML = `
    <div class="d-oben">
      <div>${k.bild ? `<img src="${esc(bildGross(k.bild))}" alt="${esc(k.name)}">` : ""}</div>
      <div>
        <h2 id="d-name">${esc(k.name)}</h2>
        <p class="d-meta">${esc(k.set)} · Nr. ${esc(k.nummer)}${k.nummerOffiziell ? "/" + k.nummerOffiziell : ""} · ${esc(k.seltenheit)}${k.release ? ` · Release ${datum(k.release)}` : ""}<br><span class="klein">ID ${esc(k.id)}${cm.stand ? ` · Cardmarket-Stand ${new Date(cm.stand).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}` : ""}</span></p>
        <div class="vergleich">
          <div class="kachel ${bester === "Cardmarket" ? "bester" : ""}"><div class="l">Cardmarket Trend</div><div class="w">${eur(cm.trend)}</div><div class="z">ab ${eur(cm.ab)} (jeder Zustand)</div></div>
          <div class="kachel ${bester === "eBay" ? "bester" : ""}"><div class="l">eBay günstigstes</div><div class="w">${ebayMin ? eur(ebayMin.gesamt) : "–"}</div><div class="z">${ebayMin ? "Sofort-Kaufen inkl. Versand" : beobachtet ? (daten.ebay_aktiv ? "kein passendes Angebot" : "eBay noch nicht eingerichtet") : "nur für beobachtete Karten"}</div></div>
          <div class="kachel"><div class="l">Ø verkauft (Cardmarket)</div><div class="w">${eur(cm.avg7)}</div><div class="z">7 Tage · gestern ${eur(cm.avg1)} · 30 Tage ${eur(cm.avg30)}</div></div>
          <div class="kachel"><div class="l">TCGplayer (USA)</div><div class="w">${usd(k.tcgplayer_usd)}</div><div class="z">Marktpreis</div></div>
        </div>
        ${bester ? `<p>Gerade günstiger auf <b>${bester}</b>, Unterschied ${eur(Math.abs(preise[0][1] - preise[1][1]))}.</p>` : ""}
        <div class="links">
          <a href="${cmLink}" target="_blank" rel="noopener">Auf Cardmarket ansehen ↗</a>
          <a href="${ebaySuche}" target="_blank" rel="noopener">eBay: günstigste zuerst ↗</a>
          <a href="${ebayVerkauft}" target="_blank" rel="noopener">eBay: verkaufte Angebote ↗</a>
        </div>
      </div>
    </div>

    <div class="d-abschnitt">
      <h3>Ins Portfolio</h3>
      <form class="pf-form" id="pf-neu">
        ${portfolioStand().liste.length > 1 ? `<label>Portfolio<select class="feld" name="pf">${portfolioStand().liste.map((p) => `<option value="${esc(p.id)}" ${p.id === portfolioStand().aktiv ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : ""}
        <label>Anzahl<input class="feld" name="anzahl" type="number" min="1" step="1" value="1" style="width:80px"></label>
        <label>Dein Kaufpreis pro Stück (€)<input class="feld" name="kaufpreis" type="number" min="0" step="0.01" placeholder="optional" inputmode="decimal"></label>
        <label>Gekauft am<input class="feld" name="kaufdatum" type="date" value="${heute}" max="${heute}"></label>
        <button class="knopf" type="submit">＋ Hinzufügen</button>
      </form>
      <p class="klein" id="pf-neu-info">Der aktuelle Cardmarket-Preis (${eur(cm.trend)}) wird beim Hinzufügen gespeichert.${positionen.length ? ` Schon in deinem Portfolio: ${positionen.reduce((a, p) => a + p.anzahl, 0)}×.` : ""}</p>
    </div>

    <div class="d-abschnitt">
      <h3>Preisverlauf &amp; Ausblick</h3>
      <div class="diagramm" id="diagramm"></div>
      <div class="legende">
        <span><i style="background:var(--akzent)"></i>Cardmarket-Trend</span>
        <span><i style="background:var(--gain)"></i>Ø Verkaufspreis (echte Verkäufe)</span>
        <span><i style="background:var(--ebay)"></i>eBay günstigstes</span>
        <span><i style="background:var(--prognose)"></i>Ausblick mit Spanne</span>
        ${kaufpreise.length ? '<span><i style="background:var(--loss)"></i>Dein Kaufpreis</span>' : ""}
      </div>
      ${prog ? `<div class="ausblick">
        <div class="kachel"><div class="l">in 30 Tagen</div><div class="w">${eur(prog.p30.wert)}</div><div class="z">Spanne ${eur(prog.p30.unten)} – ${eur(prog.p30.oben)}</div></div>
        <div class="kachel"><div class="l">in 90 Tagen</div><div class="w">${eur(prog.p90.wert)}</div><div class="z">Spanne ${eur(prog.p90.unten)} – ${eur(prog.p90.oben)}</div></div>
        <div class="kachel"><div class="l">Tendenz</div><div class="w ${prog.tendenz >= 0 ? "plus" : "minus"}">${prozent(prog.tendenz)}</div><div class="z">auf 90 Tage</div></div>
      </div>` : ""}
      <div class="bewertung"><b>Einordnung</b><br>${bewertung(punkte, cm) || "Zu wenige Daten."}</div>
      <p class="klein">${k.release ? `Release war am ${datum(k.release)}. ` : ""}${verlauf ? `Verlauf aufgezeichnet seit ${datum(punkte.find((p) => !p.geschaetzt)?.t || Date.now())}. Er wächst jeden Tag um einen Wert. Blassere Punkte am Anfang sind aus den Cardmarket-Durchschnitten geschätzt. ` : "Für diese Karte gibt es noch keinen eigenen Verlauf. Das Diagramm zeigt die Cardmarket-Durchschnitte der letzten 30 Tage. "}Der Ausblick schreibt Trend und echte Verkaufspreise gedämpft fort. Reprints, neue Sets oder einen Hype kann er nicht vorhersehen.</p>
    </div>

    ${beobachtet ? `<div class="d-abschnitt">
      <h3>Aktuelle eBay-Angebote</h3>
      ${angebote.length ? `<table class="tabelle"><tbody>${angebote.map((a) => `<tr>
        <td><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.titel)}</a><br><span class="klein">${esc(a.art)}${a.art === "Auktion" && a.gebote != null ? ` · ${a.gebote} Gebote` : ""}${a.zustand ? " · " + esc(a.zustand) : ""}${a.land ? " · " + esc(a.land) : ""}${a.eingestellt ? " · seit " + datum(a.eingestellt) : ""}</span></td>
        <td class="r ausblenden">${eur(a.preis)}<br><span class="klein">+ ${eur(a.versand)}</span></td>
        <td class="r"><b>${eur(a.gesamt)}</b>${a.grund ? '<br><span class="marke">günstig</span>' : ""}</td></tr>`).join("")}</tbody></table>`
        : `<p class="hinweis">${daten.ebay_aktiv ? "Beim letzten Abruf gab es kein passendes Angebot." : "eBay ist noch nicht eingerichtet."} <a href="${ebaySuche}" target="_blank" rel="noopener">Direkt auf eBay suchen ↗</a></p>`}
    </div>` : `<details class="d-abschnitt">
      <summary><b>Beobachten &amp; bei günstigen Angeboten benachrichtigt werden</b></summary>
      <p>Füge diesen Eintrag in <a href="https://github.com/nick084412/pokemon-preise/edit/main/abruf/beobachten.json" target="_blank" rel="noopener">beobachten.json</a> unter <code>"karten"</code> ein und pass den Wunschpreis an.</p>
      <pre class="eintrag">${esc(eintrag)}</pre>
      <button class="leise-knopf" type="button" id="kopieren">Eintrag kopieren</button>
    </details>`}`;

  zeichne($("#diagramm"), [
    { punkte, wert: (p) => p.trend, farbe: "var(--akzent)", name: "Cardmarket", gestrichelt: false },
    { punkte: punkte.filter((p) => p.avg1).map((p) => ({ ...p, t: p.t - TAG })), wert: (p) => p.avg1, farbe: "var(--gain)", name: "Ø verkauft", nurPunkte: punkte.filter((p) => p.avg1).length < 3 },
    { punkte: punkte.filter((p) => p.ebay), wert: (p) => p.ebay, farbe: "var(--ebay)", name: "eBay ab", nurPunkte: true },
  ], { prog, release: k.release, linien: kaufpreise.map((w) => ({ wert: w, farbe: "var(--loss)", text: "Kaufpreis" })) });

  $("#pf-neu").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const stand = portfolioStand();
    const pf = stand.liste.find((p) => p.id === (f.get("pf") || stand.aktiv)) || stand.liste[0];
    const kp = parseFloat(String(f.get("kaufpreis")).replace(",", "."));
    pf.positionen.push({
      pid: Math.random().toString(36).slice(2, 10), id: k.id, name: k.name, set: k.set, setId: k.setId, nummer: k.nummer,
      bild: k.bild, anzahl: Math.max(1, parseInt(f.get("anzahl"), 10) || 1), kaufpreis: isFinite(kp) && kp > 0 ? kp : null,
      kaufdatum: f.get("kaufdatum") || heute, erfasstPreis: cm.trend, erfasstAm: heute,
    });
    speichereStand(stand);
    $("#pf-neu-info").innerHTML = `✓ Zu „${esc(pf.name)}“ hinzugefügt (erfasster Preis ${eur(cm.trend)}). <a href="#portfolio">Zum Portfolio →</a>`;
    $("#pf-neu-info a").addEventListener("click", () => dialog.close());
    if (!$('[data-seite="portfolio"]').hidden) zeigePortfolio();
  });
  const knopf = $("#kopieren");
  if (knopf) knopf.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(eintrag + ","); knopf.textContent = "Kopiert ✓"; } catch (e) { knopf.textContent = "Bitte von Hand kopieren"; }
  });
}

/* ================================================================== Diagramm */
function zeichne(ziel, reihen, { prog = null, release = null, linien = [], einheit = eur } = {}) {
  const alle = reihen.flatMap((r) => r.punkte);
  if (!alle.length) { ziel.innerHTML = '<p class="hinweis" style="padding:20px">Keine Preisdaten vorhanden.</p>'; return; }
  // Zeichenfläche an die echte Breite anpassen, damit die Schrift auf dem Handy lesbar bleibt
  const B = Math.max(300, Math.min(1000, Math.round(ziel.clientWidth - 16) || 800));
  const H = B < 560 ? 240 : 320, L = 62, R = 12, O = 16, U = 32;
  const zeiten = [...alle.map((p) => p.t), ...(prog ? prog.reihe.map((r) => r.t) : [])];
  const werte = [...reihen.flatMap((r) => r.punkte.map(r.wert)), ...(prog ? prog.reihe.flatMap((r) => [r.unten, r.oben]) : []), ...linien.map((l) => l.wert)].filter((v) => v != null);
  let t0 = Math.min(...zeiten), t1 = Math.max(...zeiten);
  if (t1 - t0 < 7 * TAG) t0 = t1 - 7 * TAG;
  let y0 = Math.min(...werte), y1 = Math.max(...werte);
  const puffer = (y1 - y0) * 0.08 || y1 * 0.1 || 1;
  y0 = Math.max(0, y0 - puffer); y1 += puffer;
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (B - L - R);
  const y = (v) => O + (1 - (v - y0) / (y1 - y0)) * (H - O - U);
  const pfad = (arr, f) => arr.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(f(p)).toFixed(1)}`).join("");
  const stufen = (arr, f) => arr.map((p, i) => (i ? `H${x(p.t).toFixed(1)}V${y(f(p)).toFixed(1)}` : `M${x(p.t).toFixed(1)},${y(f(p)).toFixed(1)}`)).join("");

  let svg = `<svg viewBox="0 0 ${B} ${H}" role="img" aria-label="Preisverlauf">`;
  for (let i = 0; i <= 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 4;
    svg += `<line x1="${L}" x2="${B - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--subtle)">${einheit(v, v < 10 ? 2 : 0)}</text>`;
  }
  const spanne = (t1 - t0) / TAG;
  const schritte = B < 560 ? 3 : 6;
  for (let i = 0; i <= schritte; i++) {
    const t = t0 + ((t1 - t0) * i) / schritte;
    svg += `<text x="${x(t)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : i === schritte ? "end" : "middle"}" font-size="12" fill="var(--subtle)">${new Date(t).toLocaleDateString("de-DE", spanne > 400 ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "short" })}</text>`;
  }
  if (release && +new Date(release) >= t0) {
    const rx = x(+new Date(release));
    svg += `<line x1="${rx}" x2="${rx}" y1="${O}" y2="${H - U}" stroke="var(--line-strong)" stroke-dasharray="2 4"/><text x="${rx + 4}" y="${O + 12}" font-size="11" fill="var(--subtle)">Release</text>`;
  }
  linien.forEach((l) => {
    svg += `<line x1="${L}" x2="${B - R}" y1="${y(l.wert)}" y2="${y(l.wert)}" stroke="${l.farbe}" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${B - R - 4}" y="${y(l.wert) - 5}" text-anchor="end" font-size="11" fill="${l.farbe}">${l.text} ${einheit(l.wert)}</text>`;
  });
  if (prog) {
    const r = prog.reihe;
    svg += `<path d="${pfad(r, (p) => p.oben)}${[...r].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.unten).toFixed(1)}`).join("")}Z" fill="var(--prognose)" opacity=".14"/>`;
    svg += `<path d="${pfad(r, (p) => p.wert)}" fill="none" stroke="var(--prognose)" stroke-width="2.5" stroke-dasharray="6 5"/>`;
    svg += `<line x1="${x(r[0].t)}" x2="${x(r[0].t)}" y1="${O}" y2="${H - U}" stroke="var(--line-strong)"/><text x="${x(r[0].t) + 4}" y="${H - U - 6}" font-size="11" fill="var(--subtle)">heute</text>`;
  }
  reihen.forEach((r) => {
    if (!r.punkte.length) return;
    if (!r.nurPunkte) svg += `<path d="${(r.stufe ? stufen : pfad)(r.punkte, r.wert)}" fill="none" stroke="${r.farbe}" stroke-width="${r.duenn ? 1.5 : 2.5}" stroke-linejoin="round" ${r.gestrichelt ? 'stroke-dasharray="3 4"' : ""}/>`;
    if (r.punkte.length <= 60 || r.nurPunkte) r.punkte.forEach((p) => { svg += `<circle cx="${x(p.t)}" cy="${y(r.wert(p))}" r="3.5" fill="${r.farbe}" opacity="${p.geschaetzt ? 0.45 : 1}"/>`; });
  });
  svg += `<line class="zeiger" y1="${O}" y2="${H - U}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/><rect x="${L}" y="${O}" width="${B - L - R}" height="${H - O - U}" fill="transparent"/></svg>`;
  ziel.innerHTML = svg + '<div class="tipp" hidden></div>';

  // Tooltip: alle Werte am nächstgelegenen Tag
  const tage = new Map();
  reihen.forEach((r) => r.punkte.forEach((p) => {
    const key = Math.round(p.t / TAG);
    const e = tage.get(key) || { t: p.t, zeilen: [] };
    e.zeilen.push(`${r.name} ${einheit(r.wert(p))}${p.geschaetzt ? " <i>(geschätzt)</i>" : ""}`);
    tage.set(key, e);
  }));
  if (prog) prog.reihe.slice(1).forEach((r) => tage.set(Math.round(r.t / TAG), { t: r.t, zeilen: [`Ausblick ${einheit(r.wert)}`, `<span class="klein">${einheit(r.unten)} – ${einheit(r.oben)}</span>`] }));
  const ziele = [...tage.values()];
  const svgEl = $("svg", ziel), tipp = $(".tipp", ziel), zeiger = $(".zeiger", ziel);
  const bewege = (ev) => {
    const box = svgEl.getBoundingClientRect();
    const t = t0 + ((((ev.clientX - box.left) / box.width) * B - L) / (B - L - R)) * (t1 - t0);
    const z = ziele.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    const zx = x(z.t);
    zeiger.setAttribute("x1", zx); zeiger.setAttribute("x2", zx); zeiger.setAttribute("visibility", "visible");
    tipp.innerHTML = `<b>${datum(z.t)}</b><br>${z.zeilen.join("<br>")}`; tipp.hidden = false;
    tipp.style.left = Math.min(Math.max(8, (zx / B) * box.width - tipp.offsetWidth / 2), box.width - tipp.offsetWidth + 8) + "px";
    tipp.style.top = "8px";
  };
  svgEl.addEventListener("pointermove", bewege);
  svgEl.addEventListener("pointerdown", bewege);
  svgEl.addEventListener("pointerleave", () => { tipp.hidden = true; zeiger.setAttribute("visibility", "hidden"); });
}

/* ================================================================== Portfolio (im Browser gespeichert) */
function portfolioStand() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SPEICHER)); } catch (e) {}
  if (!s || !Array.isArray(s.liste) || !s.liste.length) s = { aktiv: "p1", liste: [{ id: "p1", name: "Mein Portfolio", positionen: [] }] };
  if (!s.liste.some((p) => p.id === s.aktiv)) s.aktiv = s.liste[0].id;
  return s;
}
function speichereStand(s) {
  try { localStorage.setItem(SPEICHER, JSON.stringify(s)); }
  catch (e) { alert("Speichern im Browser ist nicht möglich (privater Modus?). Sichere dein Portfolio als Datei."); }
}
const alleStaende = () => portfolioStand().liste;
const aktivesPortfolio = (s = portfolioStand()) => s.liste.find((p) => p.id === s.aktiv);

$("#pf-wahl").addEventListener("change", (e) => {
  const s = portfolioStand();
  if (e.target.value === "__neu") {
    const name = prompt("Name für das neue Portfolio (z. B. dein Name):", "");
    if (name && name.trim()) {
      const id = "p" + Math.random().toString(36).slice(2, 8);
      s.liste.push({ id, name: name.trim().slice(0, 40), positionen: [] });
      s.aktiv = id;
    }
  } else s.aktiv = e.target.value;
  speichereStand(s); zeigePortfolio();
});
$("#pf-umbenennen").addEventListener("click", () => {
  const s = portfolioStand(), pf = aktivesPortfolio(s);
  const name = prompt("Neuer Name:", pf.name);
  if (name && name.trim()) { pf.name = name.trim().slice(0, 40); speichereStand(s); zeigePortfolio(); }
});
$("#pf-loeschen").addEventListener("click", () => {
  const s = portfolioStand(), pf = aktivesPortfolio(s);
  if (!confirm(`Portfolio „${pf.name}“ mit ${pf.positionen.length} Karten wirklich löschen?`)) return;
  s.liste = s.liste.filter((p) => p.id !== pf.id);
  speichereStand(s); zeigePortfolio();
});

let _pfLauf = 0;
async function zeigePortfolio() {
  const lauf = ++_pfLauf;
  const s = portfolioStand(), pf = aktivesPortfolio(s);
  $("#pf-wahl").innerHTML = s.liste.map((p) => `<option value="${esc(p.id)}" ${p.id === s.aktiv ? "selected" : ""}>${esc(p.name)} (${p.positionen.length})</option>`).join("") + '<option value="__neu">＋ Neues Portfolio …</option>';
  $("#pf-loeschen").hidden = s.liste.length < 2 && !pf.positionen.length;
  if (!pf.positionen.length) {
    $("#pf-kacheln").innerHTML = "";
    $("#pf-diagramm").innerHTML = '<p class="leer">Noch keine Karten. Such oben eine Karte, tippe sie an und wähle „＋ Hinzufügen“. Der aktuelle Preis wird dabei gespeichert.</p>';
    $("#pf-karten").innerHTML = '<p class="leer">Dein Portfolio ist leer.</p>';
    $("#pf-hinweis").textContent = "";
    return;
  }
  $("#pf-karten").innerHTML = '<p class="hinweis">Lade aktuelle Preise …</p>';
  // aktuelle Preise und Verläufe parallel laden
  const ids = [...new Set(pf.positionen.map((p) => p.id))];
  const info = {};
  await Promise.all(ids.map(async (id) => {
    const pos = pf.positionen.find((p) => p.id === id);
    let live = null;
    try { live = await holeKarteLive(id); } catch (e) {}
    const verlauf = await holeVerlauf(id, pos.setId || live?.setId);
    info[id] = { live, verlauf: (verlauf || []).filter((p) => !p.geschaetzt) };
  }));
  if (lauf !== _pfLauf) return;
  const aktuell = (p) => info[p.id]?.live?.cardmarket?.trend ?? p.erfasstPreis;
  const einsatz = (p) => (p.kaufpreis ?? p.erfasstPreis ?? 0) * p.anzahl;

  const wert = pf.positionen.reduce((a, p) => a + (aktuell(p) || 0) * p.anzahl, 0);
  const summeEinsatz = pf.positionen.reduce((a, p) => a + einsatz(p), 0);
  const ohneKaufpreis = pf.positionen.filter((p) => p.kaufpreis == null).length;
  const gewinn = wert - summeEinsatz;
  const anzahl = pf.positionen.reduce((a, p) => a + p.anzahl, 0);
  $("#pf-kacheln").innerHTML = `
    <div class="kachel"><div class="l">Aktueller Wert</div><div class="w">${eur(wert)}</div><div class="z">${anzahl} ${anzahl === 1 ? "Karte" : "Karten"} · Cardmarket-Trend</div></div>
    <div class="kachel"><div class="l">Kaufpreis gesamt</div><div class="w">${eur(summeEinsatz)}</div><div class="z">${ohneKaufpreis ? `${ohneKaufpreis}× ohne Kaufpreis, dort zählt der erfasste Preis` : "aus deinen Kaufpreisen"}</div></div>
    <div class="kachel ${gewinn >= 0 ? "bester" : ""}"><div class="l">Wertsteigerung</div><div class="w ${gewinn >= 0 ? "plus" : "minus"}">${gewinn >= 0 ? "+" : ""}${eur(gewinn)}</div><div class="z">${prozent(summeEinsatz ? (gewinn / summeEinsatz) * 100 : null)}</div></div>`;

  // Wertverlauf: je Karte bekannte Preise (Kauf, Erfassung, täglicher Verlauf, heute), dazwischen verbunden
  const heute = heuteISO();
  const tag = (d) => +new Date(d);
  const preisReihe = (p) => {
    const bekannt = [];
    if (p.kaufpreis != null && p.kaufdatum) bekannt.push([tag(p.kaufdatum), p.kaufpreis]);
    if (p.erfasstPreis) bekannt.push([tag(p.erfasstAm), p.erfasstPreis]);
    (info[p.id]?.verlauf || []).forEach((v) => { if (v.datum >= (p.kaufdatum || p.erfasstAm)) bekannt.push([v.t, v.trend]); });
    if (aktuell(p)) bekannt.push([tag(heute), aktuell(p)]);
    const m = new Map(); bekannt.forEach(([t, w]) => m.set(t, w)); // spätere Quelle gewinnt je Tag
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  };
  const reihen = pf.positionen.map((p) => ({ p, start: tag(p.kaufdatum || p.erfasstAm), r: preisReihe(p) }));
  const preisAm = (r, t) => {
    if (!r.length) return 0;
    if (t <= r[0][0]) return r[0][1];
    for (let i = 1; i < r.length; i++) if (t <= r[i][0]) { const [ta, wa] = r[i - 1], [tb, wb] = r[i]; return wa + ((wb - wa) * (t - ta)) / (tb - ta); }
    return r[r.length - 1][1];
  };
  const zeiten = [...new Set(reihen.flatMap((x) => [x.start, ...x.r.map((e) => e[0])]))].filter((t) => t <= tag(heute)).sort((a, b) => a - b);
  const wertReihe = zeiten.map((t) => ({ t, w: reihen.filter((x) => x.start <= t).reduce((a, x) => a + preisAm(x.r, t) * x.p.anzahl, 0) }));
  const einsatzReihe = zeiten.map((t) => ({ t, w: reihen.filter((x) => x.start <= t).reduce((a, x) => a + einsatz(x.p), 0) }));
  zeichne($("#pf-diagramm"), [
    { punkte: einsatzReihe, wert: (p) => p.w, farbe: "var(--subtle)", name: "Kaufpreis", duenn: true, gestrichelt: true, stufe: true },
    { punkte: wertReihe, wert: (p) => p.w, farbe: "var(--akzent)", name: "Wert" },
  ]);
  $("#pf-hinweis").textContent = "Der Verlauf startet beim Kaufdatum. Für Tage ohne gespeicherten Preis wird zwischen Kaufpreis, erfasstem Preis und den täglich aufgezeichneten Cardmarket-Preisen verbunden. Mit der Zeit wird die Kurve immer genauer.";

  // Tabelle
  $("#pf-karten").innerHTML = pf.positionen.map((p) => {
    const jetzt = aktuell(p);
    const basis = p.kaufpreis ?? p.erfasstPreis;
    const d = basis && jetzt ? (jetzt / basis - 1) * 100 : null;
    return `<div class="pf-zeile" data-pid="${esc(p.pid)}">
      <img src="${esc(bildKlein(p.bild))}" alt="" data-oeffne="${esc(p.id)}" loading="lazy">
      <div class="n"><button type="button" data-oeffne="${esc(p.id)}">${esc(p.name)}</button><small>${esc(p.set)} · ${esc(p.nummer)} · seit ${datum(p.kaufdatum || p.erfasstAm)}</small></div>
      <div class="zahlen">
        <label class="zahl">Anzahl<input class="feld klein-feld" type="number" min="1" step="1" value="${p.anzahl}" data-feld="anzahl"></label>
        <label class="zahl">Kaufpreis/Stk.<input class="feld" type="number" min="0" step="0.01" value="${p.kaufpreis ?? ""}" placeholder="${p.erfasstPreis ? p.erfasstPreis.toFixed(2) : "–"}" data-feld="kaufpreis" inputmode="decimal"></label>
        <span class="zahl">${eur(jetzt)}<small>aktuell · erfasst ${eur(p.erfasstPreis)}</small></span>
        <span class="zahl"><b class="${d >= 0 ? "plus" : "minus"}">${prozent(d)}</b><small>${jetzt && basis ? (jetzt - basis >= 0 ? "+" : "") + eur((jetzt - basis) * p.anzahl) : ""}</small></span>
      </div>
      <button class="entfernen" type="button" data-entfernen aria-label="Entfernen" title="Entfernen">✕</button>
    </div>`;
  }).join("");
  $$("#pf-karten [data-oeffne]").forEach((el) => el.addEventListener("click", () => oeffne(el.dataset.oeffne)));
  $$("#pf-karten .pf-zeile").forEach((zeile) => {
    const aendern = (fn) => { const st = portfolioStand(); const pos = aktivesPortfolio(st).positionen.find((x) => x.pid === zeile.dataset.pid); if (pos) { fn(pos, st); speichereStand(st); zeigePortfolio(); } };
    $$("input", zeile).forEach((inp) => inp.addEventListener("change", () => aendern((pos) => {
      if (inp.dataset.feld === "anzahl") pos.anzahl = Math.max(1, parseInt(inp.value, 10) || 1);
      else { const v = parseFloat(inp.value.replace(",", ".")); pos.kaufpreis = isFinite(v) && v > 0 ? v : null; }
    })));
    $("[data-entfernen]", zeile).addEventListener("click", () => {
      if (confirm("Karte aus dem Portfolio entfernen?")) aendern((pos, st) => { const pf2 = aktivesPortfolio(st); pf2.positionen = pf2.positionen.filter((x) => x.pid !== pos.pid); });
    });
  });
}

/* Sichern & übertragen */
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
const kompakt = (pf) => ({ name: pf.name, k: pf.positionen.map((p) => [p.id, p.anzahl, p.kaufpreis, p.kaufdatum, p.erfasstPreis, p.erfasstAm, p.name, p.set, p.nummer, p.setId]) });

$("#pf-link").addEventListener("click", async () => {
  const pf = aktivesPortfolio();
  const link = location.origin + location.pathname + "#import=" + b64(JSON.stringify(kompakt(pf)));
  try { await navigator.clipboard.writeText(link); $("#pf-sichern-info").textContent = "Link kopiert. Öffne ihn auf dem anderen Gerät, dann wird das Portfolio dort übernommen."; }
  catch (e) { $("#pf-sichern-info").innerHTML = `Bitte diesen Link kopieren:<br><code>${esc(link)}</code>`; }
});
$("#pf-export").addEventListener("click", () => {
  const pf = aktivesPortfolio();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(pf, null, 1)], { type: "application/json" }));
  a.download = `portfolio-${pf.name.replace(/[^\w-]+/g, "_")}-${heuteISO()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
});
$("#pf-import").addEventListener("change", async (e) => {
  const datei = e.target.files[0]; if (!datei) return;
  try { const pf = JSON.parse(await datei.text()); uebernehme(pf.name, pf.positionen); }
  catch (err) { alert("Die Datei konnte nicht gelesen werden."); }
  e.target.value = "";
});
function importiereLink(code) {
  try {
    const d = JSON.parse(unb64(code));
    const positionen = d.k.map(([id, anzahl, kaufpreis, kaufdatum, erfasstPreis, erfasstAm, name, set, nummer, setId]) => ({
      id, anzahl, kaufpreis, kaufdatum, erfasstPreis, erfasstAm, name, set, nummer, setId,
      bild: `https://assets.tcgdex.net/de/${String(setId || "").replace(/\d.*$/, "")}/${setId}/${nummer}/high.webp`,
    }));
    history.replaceState(null, "", location.pathname + "#portfolio");
    if (confirm(`Portfolio „${d.name}“ mit ${positionen.length} Karten übernehmen?`)) uebernehme(d.name, positionen);
  } catch (e) { alert("Der Übertragungslink ist ungültig."); history.replaceState(null, "", location.pathname + "#portfolio"); }
  route();
}
async function uebernehme(name, positionen) {
  const s = portfolioStand();
  const id = "p" + Math.random().toString(36).slice(2, 8);
  const liste = (positionen || []).filter((p) => p && p.id).map((p) => ({ ...p, pid: Math.random().toString(36).slice(2, 10), anzahl: Math.max(1, parseInt(p.anzahl, 10) || 1) }));
  // Bilder sicher nachladen (der Link enthält sie nicht)
  await Promise.all(liste.map(async (p) => { try { const k = await holeKarteLive(p.id); p.bild = k.bild; p.setId = k.setId; } catch (e) {} }));
  const leer = s.liste.length === 1 && !s.liste[0].positionen.length;
  const neu = { id, name: String(name || "Übernommen").slice(0, 40), positionen: liste };
  if (leer) s.liste = [neu]; else s.liste.push(neu);
  s.aktiv = id;
  speichereStand(s);
  if (location.hash !== "#portfolio") location.hash = "portfolio"; else zeigePortfolio();
}

/* ================================================================== Start */
ladeMarkt();
const _beobachtet = ladeBeobachtet();
route();
const start = new URLSearchParams(location.search).get("karte");
if (start) oeffne(start);
