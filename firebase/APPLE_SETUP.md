# Apple-inloggning för Handla på webben

Firebase-projekt: `groceries-ros`. Apple Developer-medlemskap krävs. Apple-inloggning ska inte visas som fungerande förrän leverantören verkligen har konfigurerats i Firebase.

1. I Apple Developer → Certificates, Identifiers & Profiles, skapa eller välj ett **primärt App ID** med Sign in with Apple. Appens valda bundle-ID är `se.groceriesros.handla` och Apple-teamet är `P92GB9QRA5`.
2. Skapa eller välj **Services ID** `se.groceriesros.handla.web`, aktivera Sign in with Apple och koppla till samma primära App ID.
3. Registrera webbdomänerna `groceries-ros.firebaseapp.com` och `groceries-ros.web.app`. Registrera denna Return URL exakt:

   `https://groceries-ros.firebaseapp.com/__/auth/handler`

4. Skapa en Sign in with Apple-nyckel kopplad till samma primära App ID. Spara den nedladdade `.p8`-filen utanför källkodsprojektet. Notera Apple Team ID och Key ID.
5. I Firebase Authentication → Sign-in method → Apple, ange Services ID. Under OAuth code flow anges Team ID, Key ID och den privata nyckeln. Alternativt kan den lokala hjälparen nedan göra samma sak via det dokumenterade API:t efter att Apple-identiteterna skapats.

Skicka aldrig privatnyckelns innehåll i chatten, lägg den aldrig i `web/.env.local`, och kopiera den aldrig till webbbygget. En lokal filsökväg kan lämnas till hjälparen. Team ID, Services ID och Key ID är identifierare, inte privatnycklar.

## Lokal konfiguration via Firebase CLI-inloggningen

Sätt dessa miljövariabler lokalt och kör från `firebase/`:

```sh
HANDLA_APPLE_TEAM_ID=DITT_TEAM_ID \
HANDLA_APPLE_SERVICE_ID=se.groceriesros.handla.web \
HANDLA_APPLE_KEY_ID=DITT_KEY_ID \
HANDLA_APPLE_KEY_PATH=/absolut/sokvag/AuthKey_DITT_KEY_ID.p8 \
node scripts/configure-apple.cjs --dry-run
```

`--dry-run` kontrollerar lokala indata utan att skriva till Firebase. Kör sedan samma kommando utan `--dry-run` när rätt Apple-tjänst har valts. Hjälparen är låst till projektet `groceries-ros`, undertrycker loggning av privata request/response-data och vägrar ersätta ett annat befintligt Services ID.

Kör `node scripts/sync-provider-flags.cjs` efter konfiguration, bygg om webbappen och publicera. Flaggan i klienten styr endast vilka knappar som erbjuds; det är Firebase som avgör vilka leverantörer som faktiskt accepteras.

Verifiera med ett riktigt Apple-konto på iPhone/Safari. Kontrollera även alternativet Dölj min e-post. Om lösenordsåterställning/verifieringsmejl ska skickas till Apples reläadresser, registrera `noreply@groceries-ros.firebaseapp.com` i Apple Private Email Relay enligt Firebase-dokumentationen. Befintliga konton ska inte automatiskt kopplas ihop med andra leverantörer utan användarens val.

Popup används direkt från användarens knapptryck. Om popup blockeras kan samma-domänläget på `https://groceries-ros.firebaseapp.com` använda redirect; på `web.app` visas en tydlig uppmaning att tillåta popup för att undvika Safaris begränsningar av tredjepartslagring.

Källor: [Firebase Apple web](https://firebase.google.com/docs/auth/web/apple), [Apple konfigurera webbinloggning](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/), [Firebase OAuth-konfiguration via REST](https://firebase.google.com/docs/auth/configure-oauth-rest-api).

## Verifierad konfigurationsstatus

Firebase Apple-leverantör är aktiverad med Services ID `se.groceriesros.handla.web`, Team ID `P92GB9QRA5`, och native bundle-ID `se.groceriesros.handla` i tillåtelselistan. Den privata nyckeln har lästs från en lokal `.p8`-fil och skickats direkt till Firebase med undertryckt request/response-loggning. Nyckeln och `web/.env.local` ingår inte i Git. Båda AASA-källorna och den publicerade filen använder `P92GB9QRA5.se.groceriesros.handla`.

Första verifieringen visade `invalid_client`; efter ägarens korrigering av Services ID-inställningarna öppnas nu Apples riktiga svenska inloggningsformulär för **Handla Web** med synliga fält för e-post/telefonnummer och lösenord. Begäran använde exakt rätt `client_id=se.groceriesros.handla.web` och `redirect_uri=https://groceries-ros.firebaseapp.com/__/auth/handler`. Agentens kontroll verifierar auktoriseringsstarten utan personlig inloggning. Användaren bekräftade därefter att fullständig Apple-inloggning på webben lyckades. Kontrollera att identifieraren verkligen är av typen **Services ID**, att Sign in with Apple är aktiverat, att rätt primärt App ID valts och att domäner/Return URL har sparats både inne i Configure och på identifierarens övergripande Save-knapp.

Apple-knappen är aktiverad på den publicerade webbappen. Google-knappen har också verifierats öppna Googles inloggningssida. Kör `qa/browser/providers.mjs` efter att Apple-inställningarna ändrats. Den startar auktorisering utan att fylla i eller slutföra användarens personliga Apple-inloggning.
