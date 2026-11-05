# Pokémon-Kartenpreise

Preisvergleich für Pokémon-Karten (Cardmarket & eBay.de) mit Preisverlauf, Ausblick und Push-Nachricht bei günstigen Angeboten.

Seite: https://nick084412.github.io/pokemon-preise/

- `abruf/beobachten.json` – beobachtete Karten mit Wunschpreis (Euro inkl. Versand) und eBay-Suchbegriff
- `abruf/abrufen.py` – holt Cardmarket-Preise (TCGdex-API) und eBay.de-Angebote (eBay-Browse-API), schreibt `docs/daten.json` und den Verlauf `docs/verlauf/<id>.json`
- `abruf/gemeldet.json` – bereits gemeldete Angebote (damit keine Nachricht doppelt kommt)
- `docs/` – die Webseite (GitHub Pages)
- `.github/workflows/preise.yml` – läuft alle 2 Stunden, Push über ntfy (Kanal pokemon-preise-k7m2xq9d)
- `abruf/markt.py` + `.github/workflows/markt.yml` – täglicher Markt-Abruf über alle Karten aus Schwert & Schild, Karmesin & Purpur und Mega-Entwicklung (ca. 8.500 Karten): Begehrteste Karten, Gewinner & Verlierer und der Preisverlauf je Karte (`docs/markt/`)

Die Seite hat drei Bereiche (Menü oben):
- **Markt** – die 10 begehrtesten Karten und die größten Gewinner und Verlierer (7 / 30 Tage)
- **Beobachtet** – günstige Angebote, beobachtete Karten, Push-Nachrichten
- **Portfolio** – eigene Karten mit Kaufpreis und Wertentwicklung. Gespeichert wird nur im Browser des jeweiligen Geräts, Übertragung per Link oder Datei.

Cardmarket gibt einzelne Verkäufe und Klickzahlen nicht heraus (keine neue API-Freigabe, die Webseite sperrt automatische Abrufe).
Verwendet werden die Ø-Verkaufspreise (gestern, 7 und 30 Tage), die TCGdex täglich von Cardmarket übernimmt.

Gemeldet wird ein Angebot unter dem Wunschpreis oder `rabatt_prozent` unter dem Cardmarket-Trend.

eBay einrichten: unter https://developer.ebay.com ein kostenloses Konto anlegen, eine App (Production) erstellen,
dann im Repository unter Settings → Secrets and variables → Actions `EBAY_CLIENT_ID` (App ID) und `EBAY_CLIENT_SECRET` (Cert ID) eintragen.
