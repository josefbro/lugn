# Lugn Faktura

Ett fristående, byggfritt fakturasystem (vanilla HTML/CSS/JS) som lever i
`prototype/faktura/` och följer med Lugns GitHub Pages-deploy. Flera bolag kan
använda samma app — varje faktura tillhör ett säljarbolag.

**Live efter deploy:** `<din-pages-url>/faktura/`
**Lokalt:** kör Lugn-servern och öppna `http://localhost:8123/faktura/`.

## Funktioner

- **Flera bolag** – lägg upp obegränsat med säljarbolag (AB, enskild firma, HB …)
  med logotyp, org.nr, momsnr, säte, F-skatt, bankgiro/plusgiro/IBAN. Växla aktivt
  bolag i topbaren.
- **Kunder** per bolag – företag eller privatpersoner, med referens och (vid
  EU-handel) momsnummer.
- **Fakturor** med live-förhandsvisning, automatiskt fakturanummer i obruten svit
  per bolag, förfallodatum, flera momssatser (25/12/6/0 %), rabatt per rad,
  öresavrundning, omvänd skattskyldighet och momsbefrielse med hänvisning.
- **Laglighetscheck** – en checklista validerar varje faktura mot bokföringslagens
  och momslagens formkrav innan den bokförs.
- **PDF** – proffsig A4-faktura (jsPDF) med alla obligatoriska uppgifter och
  momsspecifikation per momssats.
- **E-post** – mailto (öppnar e-postklienten, PDF laddas ner) eller helautomatiskt
  via EmailJS med PDF som bilaga.
- **Lagring** – allt i `localStorage` + JSON-export/import. Valfri synk mot
  **Google Drive** (varje bolag kan koppla sitt eget konto).
- **Bokföring (heltäckande för små AB)** – automatisk dubbel bokföring med
  BAS-konton från fakturor, utgifter, löner och tillgångar. Flikar:
  Verifikationer (inkl. manuella med live-balanskontroll), Huvudbok,
  Utgifter, **Lön** (arbetsgivaravgift 31,42 % + AGI-underlag per månad),
  **Tillgångar** (rak månadsavskrivning, bokförs automatiskt),
  **Rapporter** (resultat- och balansräkning), Momsrapport
  (Skatteverkets rutor), **Årsavslut** (bolagsskatt 20,6 % med
  ett-klicks bokning + checklista) och Export (SIE4 + CSV).
- **Årsredovisning (K2)** – komplett PDF enligt BFNAR 2016:10:
  förvaltningsberättelse (verksamhet, flerårsöversikt, förändringar i
  eget kapital, resultatdisposition), RR, BR, noter och underskrifter.
- **Inkomstdeklaration 2 (INK2)** – räkenskapsschema (INK2R) och
  skattemässiga justeringar (INK2S) med SRU-fältkoder, plus export av
  `INFO.SRU` + `BLANKETTER.SRU` för Skatteverkets filöverföring.
  Testa alltid filerna i Skatteverkets testtjänst före skarp inlämning.
- **Bank** – importera CSV från internetbanken (kolumner auto-detekteras,
  dubbletter hoppas över). Matcha inbetalningar mot öppna fakturor,
  utbetalningar mot obetalda utgifter, eller kategorisera direkt mot
  BAS-konto. Allt går att ångra.
- **Revisionslogg** – append-only behandlingshistorik med hash-kedja
  (manipulation bryter kedjan). Loggar alla bokföringshändelser;
  exporteras som CSV och ingår i JSON-backupen.

## Filer

| Fil | Ansvar |
|-----|--------|
| `index.html` | Skal + laddar CDN-bibliotek och moduler |
| `faktura.css` | Stil (Lugns sage/cream/coral-palett) |
| `store.js`   | Datamodell, localStorage, CRUD, export/import |
| `compute.js` | Moms, summor, öresavrundning, formattering, validering |
| `pdf.js`     | PDF-generering (jsPDF + autotable) |
| `email.js`   | mailto + EmailJS |
| `drive.js`   | Google Drive-synk (klient-side OAuth, `drive.file`) |
| `app.js`     | Router, vyer, formulär, UI-logik |

## Valfri setup

### EmailJS (helautomatiskt utskick)
1. Skapa gratiskonto på emailjs.com, koppla en e-posttjänst (t.ex. Gmail).
2. Skapa en mall med variablerna `{{to_email}}`, `{{subject}}`, `{{message}}`,
   `{{from_name}}` och en **Variable Attachment** kopplad till `{{content}}`
   (base64) med filnamn `{{filename}}`.
3. Klistra in Public key, Service ID och Template ID under **Inställningar**.

### Google Drive-synk
1. `console.cloud.google.com` → nytt projekt.
2. Aktivera **Google Drive API**.
3. Skapa **OAuth-klient-ID** (typ: Webbapplikation).
4. Lägg sidans adress under *Authorized JavaScript origins*
   (t.ex. `https://<användare>.github.io`).
5. Klistra in klient-ID:t under **Inställningar → Google Drive** och tryck *Anslut*.

Scopen är `drive.file`, vilket innebär att appen bara ser filer den själv skapat —
därför krävs ingen Google-verifiering.

## Begränsningar / noteringar

- Ingen inloggning eller server – data ligger i webbläsaren. Exportera backup
  regelbundet, eller använd Drive-synk för att flytta mellan datorer.
- mailto kan inte bifoga PDF automatiskt; den laddas ner så att du bifogar den
  i mejlet som öppnas. EmailJS bifogar PDF:en automatiskt.
- Momssatser och formkrav följer svenska regler 2026 (bokföringslagen,
  mervärdesskattelagen). Stäm alltid av mot Skatteverket vid tveksamhet.
