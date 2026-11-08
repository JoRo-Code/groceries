# Handla webb

React + Vite med Firebase Authentication och Firestore. Responsivt gränssnitt med gemensamma hushåll, inbjudningslänkar, flera listor, 309 svenska varuförslag, färgkategorier, mängder och avbockning.

## Kör lokalt

```sh
npm ci
npm run dev
```

`src/backend.js` läser `VITE_FIREBASE_CONFIG` (JSON) ur `.env.local`. Providerflaggor avgör vilka sociala inloggningsknappar som går att använda. Google och Apple behöver motsvarande leverantörskonfiguration i Firebase; e-post/lösenord är ett separat alternativ.

För emulatorer:

```sh
VITE_USE_EMULATORS=true npm run dev -- --port 5173
```

Auth-emulatorn körs på port 9099 och Firestore på 8185, projekt `demo-handla`.

`/?demo=1` är en uttryckligt märkt förhandsvisning med lokala exempeldata. Den skriver inte till Firebase och innehållet försvinner vid omladdning.

## Bygg och kontrollera

```sh
npm test
npm run build
npm run preview
```

Backend-integrationstester kräver startade emulatorer. Produktionsbygget innehåller en genererad service worker som lagrar appens statiska filer för hemskärmsinstallation. Firebase Hosting publicerar `dist/` och skickar `/join/*` till appens indexfil.

Firestore använder minnescache: en redan öppen lista går att ändra utan nät, och ändringarna synkas när anslutningen återkommer. Håll sidan öppen tills synkningen är klar. Hushållets data lagras inte för återöppning helt offline. Utloggning blockeras medan denna flik har osynkade ändringar.

Varukatalogen i `src/groceries.json` är extraherad från iOS-appens `GroceryCatalog.swift`, med samma stabila kategori-ID:n. Tester kontrollerar 309 unika poster, matchning och hushållets egna kategorival.
