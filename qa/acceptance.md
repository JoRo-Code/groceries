# Manuell acceptans på två iPhone-enheter

Den här checklistan kräver ett konfigurerat Firebase-projekt, publicerade regler och Hosting samt en signerad app med rätt Apple-entitlements. Att simulatorbygget lyckas bevisar inte dessa integrationer.

1. Starta appen utan konfigurationsfil. Den ska visa installationshjälp utan att krascha eller visa påhittade användardata.
2. Med konfiguration: logga in med två olika Apple-konton. Avbryt först en Apple-inloggning och kontrollera att den går att försöka igen.
3. Konto A skapar ett hushåll. Kontrollera att Veckohandling finns och skapa ytterligare en lista. Starta om appen: samma hushåll och listor ska finnas kvar.
4. A skapar och delar en inbjudningslänk. B öppnar länken före inloggning, loggar in och bekräftar rätt hushåll. B ska kunna läsa båda listorna.
5. Lägg till ”Mjölk”, mängd ”2 l”, på A. Kontrollera att B ser ändringen. B bockar av och A ser avbockningen. Skriv ”mj” och kontrollera inbyggda förslag utan att varan tidigare lagts till. Lägg till en ny vara genom att välja ett förslag. Ändra en varas mängd och kategori: båda enheterna ska se ändringen och färgkanten. Ändra även mängden på en avbockad vara och kontrollera att den förblir avbockad och överstruken.
6. Slå på flygplansläge på A efter att listan laddats. Lägg till, bocka av och ta bort varor. Kontrollera indikering för väntande synkning. Återanslut och kontrollera slutresultatet på B.
7. Skapa en ny inbjudningslänk på A. Den gamla ska inte längre ge ett nytt konto tillgång. Återkalla länken: den nya ska också sluta fungera, medan B behåller sitt medlemskap.
8. Öppna en länk från ett annat hushåll med ett redan anslutet konto. Appen ska förklara att byte inte stöds och behålla befintligt hushåll.
9. Logga ut och in igen. Kontrollera att inga listor från föregående konto visas under inloggning eller vid fel.
10. På en iPhone utan app: öppna länken och kontrollera installationssidan. Efter installation via TestFlight/App Store måste ursprungslänken öppnas igen, eller klistras in i appen. TestFlight-/App Store-distribution och butikslänk är ännu inte konfigurerade.

## Verifiering som kräver nät och riktiga konton

Apple-inloggning, entitlement-signering, Apples hämtning av AASA-filen, Universal Links och delning mellan två verkliga användare måste verifieras efter projektkonfiguration. Regeltester körs separat mot en lokal Firestore-emulator och kräver inget betalprojekt.
