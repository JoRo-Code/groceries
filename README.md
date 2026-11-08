# Handla

Native iPhone-app i SwiftUI med Firebase Authentication (e-post/lösenord och Apple), Firestore och Firebase Hosting för inbjudningslänkar. Arbetsnamnet är Handla. Ett workspace kallas **hushåll** i gränssnittet.

Webbappen finns i [`web/`](web/README.md) och använder samma hushåll, listor och Firebase-databas. Den kan användas direkt i webbläsaren och läggas på hemskärmen. Native-appen kräver fortfarande ett riktigt iOS bundle ID, Apple-signering och Firebase-konfigurationsfil.

## Första versionen

- Logga in med e-post/lösenord eller Apple, skapa ett hushåll eller anslut med inbjudningslänk.
- Ett hushåll per konto; alla medlemmar delar listor och sparade varuförslag.
- Flera listor, varor med redigerbar mängd och kategori, avbockning och borttagning av varor. Avbockade varor ligger kvar överstrukna.
- 309 vanliga svenska mat- och hushållsvaror finns inbyggda från start. Förslag matchar utan hänsyn till versaler eller accenter och visar prefixträffar först. Hushållets egna varor och kategorival kompletterar katalogen.
- Färgade vänsterkanter visar varornas kategori, med gemensam gruppering i listan.
- Firestore-lyssnare för synkning och lokal cache. Nya listor och varuändringar köas offline; att skapa hushåll eller ansluta kräver nät.
- Ägaren skapar en återanvändbar inbjudan som gäller i sju dagar. En ny länk ersätter den gamla. Återkallning stoppar nya anslutningar.
- Universal Links sparas lokalt fram till inloggning; mottagaren bekräftar anslutningen.
- Firebase-regler kontrollerar medlemskap vid varje dataåtkomst. Inbjudningar kan inte listas. Medlemskap och användarprofil skapas atomiskt.

## Lokal start

1. Öppna `Handla.xcodeproj` i Xcode. Projektet kan återskapas med `xcodegen generate` från `project.yml`.
2. Ändra `PRODUCT_BUNDLE_IDENTIFIER` (`se.example.handla`) i `project.yml`. Ange ditt team som `DEVELOPMENT_TEAM` under `settings.base` eller välj det i Xcode efter generering. Aktivera Sign in with Apple och Associated Domains för samma App ID i Apple Developer.
3. Skapa/välj Firebase-projekt på Spark, registrera iOS-appen med samma bundle ID och lägg `GoogleService-Info.plist` i `Handla/`. Kör `xcodegen generate` igen så att filen kommer med som resurs.
4. Aktivera e-post/lösenord och Apple som inloggningsmetoder i Firebase Authentication. Samma e-postkonto används i webbappen och iOS-appen; lösenord kan återställas från inloggningsvyn. Skapa Firestore-databas i lämplig EU-region. Aktivera inte öppna testregler.
5. Ändra `INVITE_HOST` i `project.yml` till projektets faktiska Hosting-domän, t.ex. `mitt-projekt.web.app`. Generera projektet igen.
6. Ändra `YOUR_TEAM_ID.se.example.handla` i `firebase/public/.well-known/apple-app-site-association` till appens verkliga application identifier (App ID prefix och bundle ID).
7. Från `firebase/`: kör `npm ci`, `npx firebase login` och, när rätt projekt är valt, `npx firebase deploy --project DITT_PROJEKT_ID --only firestore:rules,hosting`.
8. Kör appen på en signerad iPhone. Testa delning mellan två olika Apple-konton.

Inget Firebase-projekt skapas och inget publiceras av den lokala byggrutinen. Utan Firebase-konfiguration visas en tydlig konfigurationsvy.

## Kontrollera

Bygg utan signering:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project Handla.xcodeproj -scheme Handla -sdk iphonesimulator -configuration Debug -derivedDataPath .build CODE_SIGNING_ALLOWED=NO build
```

Regeltester (Java 21 krävs; välj Java 21 med `JAVA_HOME` om det inte är systemets standard):

```sh
cd firebase
npm ci
npm test
```

På Homebrew kan Java 21 väljas med `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` och `export PATH="$JAVA_HOME/bin:$PATH"`.

Testerna kontrollerar åtkomst för utomstående, atomiskt skapande, medlemskap via giltig inbjudan, utgångna/förfalskade/ersatta länkar och att medlemmen inte kan höja sin behörighet. Kategoritester täcker giltiga kategorier, avvisade ogiltiga värden och äldre dokument utan kategori.

Katalogen har också [19 fristående kontroller](qa/catalogue/README.md) som körs utan Firebase. Firebase-sviten omfattar 19 testfall. Se [qa/build-result.md](qa/build-result.md) för verifieringens omfattning.

I ett Debug-bygge kan launch-argumentet `--preview-shopping` visa exempeldata för visuell kontroll utan Firebase. Vyn är märkt som förhandsvisning och gör inga molnskrivningar.

Browserflödet med två separata användare har också verifierats mot Firebase-emulatorerna: [10/10 UI-flöden godkända](qa/browser/RESULTS.md), inklusive inbjudan, synkning, offlineändringar och utloggning utan kvarvarande hushållsdata.

En manuell checklista för den konfigurerade appen finns i [qa/acceptance.md](qa/acceptance.md).

## Kvar före App Store

Denna version är en utvecklingsgrund, inte en publiceringsklar app. Verifiera Apple-inloggning, Universal Links och tvåanvändarsynkning i det verkliga Firebase-projektet. Lägg till kontoradering inklusive Apple-tokenåterkallning, hantering av medlemmar/utträde/ägarbyte, appikon, integritetspolicy och App Store-metadata. Lägg sedan in appens riktiga App Store-länk på inbjudningssidan.

Det finns inget automatiskt flöde från App Store-installation tillbaka till inbjudan: mottagaren öppnar originalinbjudan igen eller klistrar in länken i appen. En användare som redan tillhör ett annat hushåll kan inte byta i denna version.

Hosting + Auth + Firestore kräver inga Cloud Functions eller betalda dynamiska länkar. Gratis drift förutsätter att användningen håller sig inom Spark-planens aktuella gränser.
