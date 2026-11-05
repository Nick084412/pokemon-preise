#!/usr/bin/env python3
"""Täglicher Markt-Abruf über alle Karten der aktuellen Serien (Schwert & Schild, Karmesin & Purpur, Mega-Entwicklung).

Quelle: TCGdex-API, die täglich die Cardmarket-Preise übernimmt (Trend, Ab-Preis und Ø Verkaufspreis
von gestern / 7 Tagen / 30 Tagen – die Durchschnitte stammen aus echten Cardmarket-Verkäufen).

Schreibt:
- docs/markt/verlauf/<setId>.json  Preisverlauf je Karte (ein Punkt pro Tag, Karten ab MIN_PREIS €)
- docs/markt/uebersicht.json       Begehrteste Karten, Gewinner und Verlierer

Aufruf: python3 abruf/markt.py
"""
import concurrent.futures as cf
import datetime as dt
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
ZIEL = WURZEL / "docs" / "markt"
API = "https://api.tcgdex.net/v2/de"
SERIEN = ["swsh", "sv", "me"]
MIN_PREIS = 1.0          # Karten darunter werden nicht aufgezeichnet (Massenware)
LISTE_MIN_PREIS = 5.0    # Gewinner/Verlierer erst ab diesem Preis (sonst wirkt 0,10 → 0,30 € wie +200 %)
PARALLEL = 6


def hole(url, versuche=3):
    for i in range(versuche):
        try:
            anfrage = urllib.request.Request(url, headers={"User-Agent": "pokemon-preise/1.0"})
            with urllib.request.urlopen(anfrage, timeout=40) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if i == versuche - 1:
                raise
            time.sleep(2 * (i + 1))


def zahl(x):
    return round(float(x), 2) if isinstance(x, (int, float)) and x > 0 else None


def lade(pfad, standard):
    try:
        return json.loads(pfad.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return standard


def karte_holen(cid):
    try:
        k = hole(f"{API}/cards/{urllib.parse.quote(cid)}")
    except Exception as fehler:
        print("  Fehler", cid, fehler)
        return None
    cm = (k.get("pricing") or {}).get("cardmarket") or {}
    return {
        "id": k["id"], "name": k["name"], "nummer": k.get("localId", ""), "seltenheit": k.get("rarity", ""),
        "bild": k.get("image"), "trend": zahl(cm.get("trend")), "avg1": zahl(cm.get("avg1")),
        "avg7": zahl(cm.get("avg7")), "avg30": zahl(cm.get("avg30")), "ab": zahl(cm.get("low")),
    }


def wert_vor(punkte, heute, tage):
    """Trendpreis von vor mindestens `tage` Tagen aus dem echten (nicht geschätzten) Verlauf."""
    grenze = (heute - dt.timedelta(days=tage)).isoformat()
    alte = [p for p in punkte if p[0] <= grenze and not (len(p) > 3 and p[3])]
    return alte[-1][1] if alte else None


def main():
    heute = dt.datetime.now(dt.timezone.utc).date()
    tag = heute.isoformat()
    sets = []
    for serie in SERIEN:
        sets += [s["id"] for s in hole(f"{API}/series/{serie}")["sets"]]
    print(len(sets), "Sets")

    alle = []
    for sid in sets:
        try:
            s = hole(f"{API}/sets/{urllib.parse.quote(sid)}")
        except Exception as fehler:
            print("Set-Fehler", sid, fehler)
            continue
        with cf.ThreadPoolExecutor(PARALLEL) as ex:
            karten = [k for k in ex.map(karte_holen, [c["id"] for c in s.get("cards", [])]) if k]
        pfad = ZIEL / "verlauf" / f"{sid}.json"
        v = lade(pfad, {"set": s["name"], "setId": sid, "release": s.get("releaseDate"), "karten": {}})
        v.update(set=s["name"], release=s.get("releaseDate"))
        for k in karten:
            k.update(set=s["name"], setId=sid, release=s.get("releaseDate"), promo="promo" in s["name"].lower() or sid.endswith("p"))
            eintrag = v["karten"].get(k["id"])
            if not k["trend"] or (k["trend"] < MIN_PREIS and not eintrag):
                alle.append((k, []))
                continue
            if eintrag is None:
                eintrag = {"p": []}
                # Startwerte aus den Cardmarket-Durchschnitten (als geschätzt markiert)
                for tage, wert in ((15, k["avg30"]), (4, k["avg7"])):
                    if wert:
                        eintrag["p"].append([(heute - dt.timedelta(days=tage)).isoformat(), wert, None, 1])
            eintrag.update(n=k["name"], nr=k["nummer"], r=k["seltenheit"], b=k["bild"])
            eintrag["p"] = [p for p in eintrag["p"] if p[0] != tag] + [[tag, k["trend"], k["avg1"]]]
            v["karten"][k["id"]] = eintrag
            alle.append((k, eintrag["p"]))
        pfad.parent.mkdir(parents=True, exist_ok=True)
        pfad.write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{sid:<10} {len(karten):>4} Karten")

    def kurz(k, **extra):
        return {"id": k["id"], "name": k["name"], "set": k["set"], "nummer": k["nummer"],
                "bild": k["bild"], "trend": k["trend"], "avg1": k["avg1"], "avg7": k["avg7"],
                "avg30": k["avg30"], **extra}

    # Begehrteste Karten: höchster Marktwert in Sets der letzten 12 Monate, mit Verkäufen in den letzten Tagen.
    # (Cardmarket gibt Klickzahlen nicht heraus – das ist der beste frei verfügbare Ersatz.)
    jahr = (heute - dt.timedelta(days=365)).isoformat()
    aktuell = [k for k, _ in alle if k["trend"] and k["avg7"] and k["bild"] and not k["promo"] and (k["release"] or "") >= jahr]
    begehrt = [kurz(k) for k in sorted(aktuell, key=lambda k: -k["trend"])[:10]]

    def veraenderung(k, punkte, tage):
        trend, a1, a7, a30 = k["trend"], k["avg1"], k["avg7"], k["avg30"]
        # Plausibilität: weichen Trend und Verkaufsschnitt stark voneinander ab, sind die Daten unsicher
        # (z. B. Einzelverkauf in schlechtem Zustand oder vermischte Varianten) → Karte nicht listen.
        if not a7 or not 0.5 <= trend / a7 <= 2:
            return None, None
        alt = wert_vor(punkte, heute, tage)
        if alt:
            return (trend / alt - 1) * 100, "Verlauf"
        # Ersatz, solange der eigene Verlauf noch kürzer ist: Trend und echte Verkaufspreise
        # gegen den längeren Verkaufsschnitt (geometrisches Mittel, dämpft Ausreißer)
        if tage <= 7:
            if a1 and 0.4 <= a1 / trend <= 2.5:
                return ((trend / a7 * a1 / a7) ** 0.5 - 1) * 100, "Verkaufsschnitt"
            return (trend / a7 - 1) * 100, "Verkaufsschnitt"
        if a30 and 0.4 <= a7 / a30 <= 2.5:
            return ((trend / a30 * a7 / a30) ** 0.5 - 1) * 100, "Verkaufsschnitt"
        return None, None

    bewegung = {}
    for tage in (7, 30):
        liste = []
        for k, punkte in alle:
            if k["promo"] or not k["bild"]:
                continue  # Promokarten: wenige Verkäufe, stark schwankende Schnitte
            if not k["trend"] or k["trend"] < LISTE_MIN_PREIS or not k["avg7"] or k["avg7"] < LISTE_MIN_PREIS / 2:
                continue
            d, quelle = veraenderung(k, punkte, tage)
            if d is not None:
                liste.append(kurz(k, aenderung=round(d, 1), quelle=quelle))
        liste.sort(key=lambda x: x["aenderung"])
        bewegung[str(tage)] = {"gewinner": liste[::-1][:10], "verlierer": liste[:10]}

    ZIEL.mkdir(parents=True, exist_ok=True)
    (ZIEL / "uebersicht.json").write_text(json.dumps({
        "stand": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "karten_gesamt": len(alle), "sets": len(sets), "min_preis_listen": LISTE_MIN_PREIS,
        "begehrt": begehrt, "bewegung": bewegung,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Fertig:", len(alle), "Karten")


if __name__ == "__main__":
    main()
