# Zepp Store Release Checklist

Status na podstawie repo `Parallax Pilot` i oficjalnych docs Zepp z 2026-04-03.

## 1. Rejestracja i tożsamość aplikacji

- [x] `appId` jest ustawione w [zepp-app/app.json](C:/Users/krzys/Projects/Parallax-Pilot/zepp-app/app.json): `1110694`
- [x] `appName`, `version.name`, `version.code`, `vender`, `description` są ustawione
- [x] `appId 1110694` w Zepp Console jest już znane dla tej aplikacji
- [x] Nazwa aplikacji nie koliduje z inną Twoją aplikacją w konsoli; to pierwsza aplikacja na tym koncie
- [x] Publiczny nickname developera w koncie Zepp Console jest już ustawiony

## 2. Pakiet do submission

- [x] Projekt buduje się do ZAB przez `npm run build`
- [x] `appId` w paczce powinno zgadzać się z `appId` w release
- [x] Przed submission podbij `version.code` i `version.name` do faktycznego release
- [x] Zbuduj świeży ZAB tuż przed uploadem i trzymaj ścieżkę do konkretnego artefaktu release
  Artefakt release: [1110694-Parallax_Pilot-1.0.1-20260403111319.zab](C:/Users/krzys/Projects/Parallax-Pilot/zepp-app/dist/1110694-Parallax_Pilot-1.0.1-20260403111319.zab)
- [ ] Po uploadzie sprawdź w konsoli, czy wykryte supported devices zgadzają się z tym, co chcesz wspierać

## 3. Targety i zgodność

- [x] Manifest jest `configVersion: v3`
- [x] Runtime jest ustawiony na `4.0`
- [x] Są targety dla round i square
- [x] Są lokalizacje `en-US` i `pl-PL`
- [ ] Sprawdź na realnym urządzeniu round i square, nie tylko w preview lub simulatorze
- [ ] Zdecyduj, czy naprawdę chcesz wspierać tylko targety `480 round` i `390 square`, czy trzeba poszerzyć matrycę urządzeń

## 4. Store listing i copy

- [x] Przygotuj listing dla każdego języka, który deklarujesz w appce: teraz minimum `en-US` i `pl-PL`
- [x] Dla każdego języka przygotuj:
- [x] nazwę aplikacji
- [x] krótki opis / app profile
- [x] pełny opis / app details
- [x] preview image powiązany z językiem
- [x] Ustal kategorię aplikacji w sklepie; dla tej gry najbardziej prawdopodobna kategoria to coś z obszaru `Game` lub `Entertainment`
- [ ] Ustal kraje/regiony publikacji

## 5. Assety store

- [x] Ikony runtime są w repo
- [x] Przygotuj osobny store icon `240x240 PNG` z transparentnym tłem do uploadu w Zepp Console
- [x] Zweryfikuj, że store icon nie jest po prostu obecnym `248x248` runtime iconem przeskalowanym bez korekty
- [x] Przygotuj co najmniej 3 screenshoty store-ready `360x360 PNG`
- [x] Dla round: screenshot ma być osadzony centralnie na kwadratowym transparentnym tle
- [x] Dla square: screenshot ma być osadzony centralnie na kwadratowym transparentnym tle
- [x] Upewnij się, że UI zegarka jest zmaksymalizowane w obszarze obrazka
- [x] Nie używaj obecnych screenshotów z Playwright 1:1 do submission; są dobre do review, ale nie są jeszcze gotowymi assetami store

## 6. Prywatność i permissions

- [x] Manifest deklaruje permissions:
- [x] `device:os.accelerometer`
- [x] `device:os.local_storage`
- [x] `data:os.device.info`
- [x] Przygotuj pełny tekst privacy statement do wklejenia w Zepp Console
- [x] W privacy statement opisz co najmniej:
- [x] użycie akcelerometru do sterowania
- [x] lokalny zapis ustawień i score history na zegarku
- [x] odczyt informacji o urządzeniu do dopasowania UI i sterowania
- [x] czy dane opuszczają urządzenie; z obecnego repo wynika, że raczej nie, ale potwierdź to przed publikacją
- [ ] W konsoli zaznacz dokładnie te permissions, których używa manifest

## 7. SDK i zależności

- [x] Odpowiedz w submission, czy paczka zawiera SDK
- [x] Z obecnego repo wnioskuję, że runtime app nie zawiera zewnętrznego SDK i odpowiedź powinna być `No`, ale potwierdź to na finalnym buildzie

## 8. QA przed submission

- [x] `npm test`
- [x] `npm run build`
- [x] browser preview screenshot matrix istnieje
- [x] Zrób finalny smoke test na prawdziwym zegarku round
- [ ] Zrób finalny smoke test na prawdziwym zegarku square albo bardzo świadomie ogranicz support
- [ ] Sprawdź onboarding:
- [ ] start gry
- [ ] settings
- [ ] scoreboard pusty
- [ ] scoreboard po kilku runach
- [ ] haptics przy kolizji
- [ ] sterowanie `tilt`, `touch`, `swipe`
- [ ] Zdecyduj, czy tryb `ROTARY` zostaje w release; obecnie w repo były z nim problemy sprzętowe na Balance 2
- [ ] Sprawdź czy copy, spacing i assety wyglądają dobrze na finalnych screenach store

## 9. Submission i review

- [ ] Wypełnij wszystkie pola w release page w Zepp Console
- [ ] Upload ZAB
- [ ] Upload store icon
- [ ] Upload screenshots
- [ ] Wklej privacy statement
- [ ] Zaznacz permissions
- [ ] Wskaż, czy paczka zawiera SDK
- [ ] Submit for review
- [ ] Obserwuj status review przez `1-5` dni roboczych
- [ ] Jeśli review odrzuci build, zapisz powód odrzucenia w repo i popraw checklistę pod kolejną iterację

## 10. Co brakuje teraz w tym repo

Najbardziej oczywiste braki przed pierwszym submission:

- [x] store icon `240x240`
- [x] 3+ submission-ready screenshoty `360x360`
- [x] privacy statement
- [x] gotowy listing copy dla `en-US` i `pl-PL`
- [ ] decyzja o regionach, kategorii i finalnym support matrix
- [ ] finalny test release na realnym hardware

## Źródła

- Zepp app submission flow: https://docs.zepp.com/docs/distribute/
- Zepp CN submission page z service categories i attachment rules: https://docs.zepp.com/zh-cn/docs/distribute/
- Zepp icon design spec: https://docs.zepp.com/docs/designs/visual/icons/
- Zepp app manifest reference: https://docs.zepp.com/docs/reference/app-json/
