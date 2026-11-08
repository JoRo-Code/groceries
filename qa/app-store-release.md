# App Store-release: Handla tillsammans

Granskad 2026-11-08. Read-only kodgranskning; detta dokument skickar inte in appen. App-ID 6832240572, bundle se.groceriesros.handla. Befintlig TestFlight 1.0 (2) är inte bevis på App Store-godkännande. Nytt versionsbygge krävs efter nedanstående implementation.

## Uppdaterad implementationsstatus

Native kontoradering är nu implementerad i Store.swift och AccountDeletionView.swift och kompilerar. Raderingsstart finns både i hushåll och onboarding utan hushåll. Apple använder färsk återautentisering och Firebase revokeToken; e-post använder lösenordsbekräftelse. Ägare med andra medlemmar överför ägarskap till namngiven, bekräftad medlem; ensam ägare raderar barnsamlingar i begränsade batcher. Ändrad mottagare stoppar åtgärden, låser upp och kräver ny plan/bekräftelse. Retry laddar aktuell plan. Auth tas bort sist.

Native SDK-emulatortest passerade fel lösenord utan dataförlust samt komplett radering av205varor, produkt, listor, inbjudan, profil, medlemskap och Auth. Adminläsningar verifierade211saknade dokument och saknat Authkonto. Se native-account-deletion.md och native-deletion-emulator.json. Firebase-agentens regler25/25 passerade. Live Apple-tokenrevokering/radering är fortfarande **inte runtime-verifierad**, eftersom ingen separat disponibel Appleidentitet finns; användarens konto har inte raderats.

Integritets- och supportlänkar är implementerade på /privacy och /support i native före inloggning och i hushåll; verkliga sidor/kontakt väntar fortfarande på webbpublicering. Butiksmetadata nedan är färdig text, men ASC-formulär/bilder/slutbygge/publik policy/support återstår före submission. Native-only Apple/password fullständigt stöd; ett oväntat annat återställt providerkonto får ärligt fel, ingen falsk raderingslänk. Ingen Google-only inloggning erbjuds i native.

## Ursprunglig audit och ansvar (historik; läs aktuell status ovan)

1. **Kontoradering saknades vid audit.** Store.swift har Apple/e-postregistrering men ingen account delete/reauth/revoke; WorkspaceView erbjuder endast utloggning. Apple kräver lättillgänglig raderingsstart i appen och borttagning av kontot/associerade personuppgifter. Enbart mejla support räcker inte för denna app. Integration: native bekräftelse, återautentisering och tydliga fel/avbryt. Firebase: autentiserad serverstyrd radering, idempotens och tester. [Apple kontoradering](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).
2. **Apple-återkallning saknades vid audit.** Nuvarande finishApple använder idToken men inte authorizationCode. Native kan begära färsk Apple-auktorisering, verifiera samma användare, återautentisera och använda Firebase Auth revokeToken(withAuthorizationCode:), före kontoborttagning. Hantera avbruten dialog och nätfel utan att visa falsk framgång. Inga privata Apple-nycklar i appen. [Firebase officiella iOS-flöde](https://firebase.google.com/docs/auth/ios/apple), [Apple tokenrevokering](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).
3. **Raderingssemantik för hushåll måste implementeras.** Vanlig medlem: ta bort medlemsidentitet/profil/Auth, återkalla åtkomst; övrigas delade listor kan finnas kvar enligt tydlig policy. Ensam ägare: radera hushåll/listor/varor/produkter/inbjudningar rekursivt. Ägare med andra medlemmar: konkret ägaröverföring eller tydlig bekräftad hushållsradering behövs; blockera inte kontoradering permanent. Firebase äger atomisk övergång, skydd mot samtidiga joins/skrivningar, återupptagning efter partiellt fel. Root väljer beteendet. Radera inte bara Auth och lämna personidentifierande medlem/profil.
4. **Integritetspolicy och support saknas.** Ingen motsvarande publik fil eller in-app-länk hittad. GET /privacy returnerar SPA HTML, inte en policy. Firebase/web-ägare publicerar riktiga statiska sidor; integration länkar policy lättåtkomligt både före inloggning och i hushåll. Root måste ge korrekt ansvarig aktör/kontaktuppgift; hitta inte på uppgifter. Policy ska beskriva data, Firebase, hushållsdelning, lagring/radering och kontakt. [Apple riktlinjer 5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/), [supportfältets kontaktkrav](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/).
5. **App Store-formulär återstår att verifiera i ASC.** Integration äger UI: App Privacy, support/privacy URL, åldersklassning, rättigheter, tillgänglighet/pris, exportkryptering och granskningskontakt/testkonto. Bygg2:s France=No är intern betascope, inte ett generellt besked för alla länder. Kontoinnehavarens juridiska/trader-uppgifter ska vara faktiska. Ingen parallell ASC-session från denna agent.

## Datadeklaration att slutföra

Kod visar FirebaseAuth+Firestore, medlemsnamn/e-postfallback, användar-ID, hushåll/listnamn, produkter/antal/kategori och senaste avbockningsdatum. Preliminär App Privacy: Name, Email Address, User ID, Other User Content, alla kopplade till konto för App Functionality. Bedöm även Purchase History eftersom avbockade inköp/tid lagras, inte bara fritext; välj efter Apples definition och slutlig implementation. Ingen Analytics/Crashlytics-dependency hittad i project.yml, ingen annonsering/spårning observerad; granska även Firebase SDK:s deklarationer innan slutliga svar. Svara inte Data Not Collected. Manifestet PrivacyInfo.xcprivacy innehåller UserDefaults CA92.1; detta ersätter varken butikens privacy-svar eller policyn. [Apple definitioner](https://developer.apple.com/app-store/app-privacy-details/).

## Färdiga svenska butikstexter

**Namn:** Handla tillsammans

**Underrubrik:** Delade inköpslistor för hemmet

**Promotext:** Samla hushållets inköp på ett ställe. Dela listor, hitta varor snabbt och bocka av tillsammans – hemma eller i butiken.

**Nyckelord:** inköpslista,matlista,handlingslista,livsmedel,hushåll,familj,matbutik,delad,shopping,matinköp

**Beskrivning:**

Gör vardagens inköp enklare med Handla tillsammans. Skapa ett hushåll, bjud in med en länk och håll koll på vad ni behöver handla.

• Skapa flera listor för vardag, helg och andra tillfällen.
• Lägg till varor med svenska förslag och tydliga kategorier.
• Skriv mängd och ändra namn eller kategori när det behövs.
• Bocka av varor och se hushållets ändringar i samma lista.
• Se senaste dygnets inköp direkt och öppna äldre inköp vid behov.
• Se när en vara lades till och senast bockades av.
• Välj ljust eller mörkt utseende, eller följ din iPhone.

Logga in med Apple eller e-post och lösenord. Alla i hushållet kan lägga till varor, bocka av och skapa listor. Internet behövs för att skapa konto, ansluta till ett hushåll och synka mellan användare. Ändringar i en redan öppnad lista kan vänta på synkning tills anslutningen är tillbaka.

**Granskningsanteckningar, svenska (klistra in först när testkonto och radering verifierats):**

Handla tillsammans är en svensk app för privata, gemensamma inköpslistor. Appen har inga köp eller prenumerationer. Inloggning behövs för att synka hushållets listor. Använd det separata e-posttestkontot i App Review Information; det innehåller ett hushåll med exempelvaror och saknar riktiga användardata. Listikonen öppnar Mina listor. Ny vara öppnar varuförslag. Tryck på en vara för att bocka av; tryck på mängden för att redigera. Medlemsikonen öppnar hushållet och inbjudningar. Äldre inköp laddas med Visa äldre inköp. Temaval finns i hushållet. Kontoradering finns via medlemsikonen → Ert hushåll → Konto → Radera konto. För konton utan hushåll finns Radera konto på välkomstsidan. Integritetspolicy och support finns i Ert hushåll och på inloggningssidan.

Granskningsuppgifter ska läggas i ASC:s avsedda fält, inte i Git. Uppdatera sista meningen till faktisk UI-sökväg efter implementation. Ge Apple ett fungerande testkonto utan tidsbegränsning/MFA-hinder; separat andra konto kan underlätta delningstest. Kör inte raderingstest på enda granskningskontot före granskning.

## Faktiska URL:er och bildmaterial

- Publik app finns: https://groceries-ros.web.app/ . Detta är appen, inte en supportsida/policy.
- Support-URL: **ingen verifierad supportsida finns ännu**. Föreslagen publiceringsväg /support.html, först efter innehåll/publicering/HTTP-kontroll.
- Privacy-URL: **ingen verifierad policy finns ännu**. Föreslagen publiceringsväg /privacy.html, först efter innehåll/publicering/HTTP-kontroll.
- ASC: https://appstoreconnect.apple.com/apps/6832240572 . Detta är intern administration, inte användarsupport.

Apple anger nu minst en iPhone-bild för Dynamic Island medium, 1179×2556 eller1206×2622 stående. Stor slot accepterar bl.a.1320×2868; sidan anger också stor FaceID-slot som krav om stor DynamicIsland saknas. Följ de obligatoriska fälten i aktuell ASC. Upp till10 bilder per storlek, JPEG/PNG utan alfa. TARGETED_DEVICE_FAMILY=1: ingen separat iPad-app annonseras. [Aktuella officiella bildspecifikationer](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

Befintliga qa/native-contrast-light-main.png, native-contrast-dark-main.png och native-contrast-light-lists.png är verifierat1206×2622. De är QA-bilder, **inte automatiskt butiksklara**: preview-vattenstämpel, exempeldataindikering/statusfält och slutlig release-UI måste kontrolleras. Ta rena skärmbilder från slutbygget med syntetiskt hushåll (inga verkliga namn/mejl):

1. Huvudlista med aktiva varor, mängder och avbockade varor.
2. Mina listor med verkliga exempelpreviews.
3. Ny vara med kategoriförslag och synlig inmatning.
4. Historik/detaljer med datum.
5. Valfri mörk huvudlista.

## Slutlig QA före submission

- Releasebygge på fysisk iPhone: kallstart, Apple+e-postinloggning, återstart och logga ut/in. Testa inte enbart debug-fixtures.
- Två separata konton: skapa, anslut via riktig Universal Link, realtime ändringar, byt lista, redigera/återställ inköp och historik20+20.
- Ny vara: tangentbord öppnar direkt; tillägg återgår till listan. Läsbarhet ljust/mörkt/system, inklusive öppen sheet vid byte.
- Offline ändring→återanslutning; ingen förlorad väntande skrivning vid utloggning/radering. Tydligt fel vid offline kontoradering.
- Radera emailkonto och Applekonto; avbryt bekräftelse/Apple-dialog; fel mitt i processen→säker retry; borttagna konton kan inte läsa gamla hushållet. Kontrollera Auth, users, members, inbjudningar och eventuell ensamägarrekursion. Senaste Apple-token ska vara återkallad.
- Ägarradering med fler medlemmar enligt vald semantik: ingen övergiven ägare och ingen oannonserad dataförlust för andra.
- Support/policy öppnas utan inloggning, visar korrekt kontakt och verkligt raderingsbeteende; ingen SPA-fallback eller 404.
- Slutligt arkiv innehåller Firebase plist, entitlements, icon, rätt privacy manifests; nytt unikt buildnummer och rätt ASC record.
- Reviewkonto/kontakt, screenshots, metadata, privacy, åldersrating, kryptering och länder slutförda. Skicka bara verifierat build, inga påståenden om godkännande förrän Apple faktiskt godkänt.
