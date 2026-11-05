# Pokémon-Kartenpreise

Preisvergleich für Pokémon-Karten (Cardmarket & eBay.de) mit Preisverlauf, Ausblick und Push-Nachricht bei günstigen Angeboten.

Seite: https://nick084412.github.io/pokemon-preise/

- `abruf/beobachten.json` – beobachtete Karten mit Wunschpreis (Euro inkl. Versand) und eBay-Suchbegriff
- `abruf/abrufen.py` – holt Cardmarket-Preise (TCGdex-API) und eBay.de-Angebote (eBay-Browse-API), schreibt `docs/daten.json` und den Verlauf `docs/verlauf/<id>.json`
- `abruf/gemeldet.json` – bereits gemeldete Angebote (damit keine Nachricht doppelt kommt)
- `docs/` – die Webseite (GitHub Pages)
- `.github/workflows/preise.yml` – läuft alle 2 Stunden, Push über ntfy (Kanal pokemon-preise-k7m2xq9d)

Gemeldet wird ein Angebot unter dem Wunschpreis oder `rabatt_prozent` unter dem Cardmarket-Trend.

eBay einrichten: unter https://developer.ebay.com ein kostenloses Konto anlegen, eine App (Production) erstellen,
dann im Repository unter Settings → Secrets and variables → Actions `EBAY_CLIENT_ID` (App ID) und `EBAY_CLIENT_SECRET` (Cert ID) eintragen.
