# Zepp Store Release Checklist

Audience: AI agents only. Human-facing documentation belongs only in `README.md` files.

Status na podstawie repo `Parallax Pilot` i oficjalnych docs Zepp.

## 1. Rejestracja i tożsamość aplikacji

- [x] `appId` jest ustawione w [zepp-app/app.json](../zepp-app/app.json): `1110694`
- [x] `appName`, `version.name`, `version.code`, `vender`, `description` są ustawione
- [x] `appId 1110694` w Zepp Console jest już znane dla tej aplikacji
- [x] Nazwa aplikacji nie koliduje z inną Twoją aplikacją w konsoli; to pierwsza aplikacja na tym koncie
- [x] Publiczny nickname developera w koncie Zepp Console jest już ustawiony

## 2. Pakiet do submission

- [x] Projekt buduje się do ZAB przez `npm run build:app`
- [x] `appId` w paczce zgadza się z `appId` w release
- [x] Przed submission podbijane są `version.code` i `version.name` przez `npm run build:app`
- [x] Świeży ZAB jest budowany przed uploadem
- [ ] Po uploadzie sprawdź w konsoli, czy wykryte supported devices zgadzają się z tym, co chcesz wspierać

## 3. Targety i zgodność

- [x] Manifest jest `configVersion: v3`
- [x] Runtime jest ustawiony na `4.0`
- [x] Są targety dla round i square
- [x] Są lokalizacje `en-US` i `pl-PL`
- [x] Finalny support matrix jest już określony w [zepp-app/app.json](../zepp-app/app.json):
  - `round-480`
  - `round-466`
  - `square-390x450`
- [ ] Sprawdź na realnym urządzeniu round i square, nie tylko w preview lub simulatorze

## 4. Store listing i copy

- [x] Listing jest przygotowany dla `en-US` i `pl-PL`
- [x] Dla każdego języka są przygotowane:
- [x] nazwa aplikacji
- [x] krótki opis / app profile
- [x] pełny opis / app details
- [x] preview image powiązany z językiem
- [x] Kategoria aplikacji jest ustalona jako `Game`
- [ ] Ustal kraje/regiony publikacji

## 5. Assety store

- [x] Ikony runtime są w repo
- [x] Jest osobny store icon `240x240 PNG` z transparentnym tłem
- [x] Store icon nie jest tylko ślepym resize runtime icon
- [x] Są przygotowane screenshoty store-ready `360x360 PNG`
- [x] Dla round screenshot jest osadzony centralnie na kwadratowym transparentnym tle
- [x] Dla square screenshot jest osadzony centralnie na kwadratowym transparentnym tle
- [x] UI zegarka jest zmaksymalizowane w obszarze obrazka

## 6. Prywatność i permissions

- [x] Manifest deklaruje permissions:
- [x] `device:os.accelerometer`
- [x] `device:os.local_storage`
- [x] `data:os.device.info`
- [x] Privacy statement jest przygotowany
- [x] Privacy statement opisuje:
- [x] użycie akcelerometru do sterowania
- [x] lokalny zapis ustawień i score history na zegarku
- [x] odczyt informacji o urządzeniu do dopasowania UI i sterowania
- [x] brak wysyłania danych poza urządzenie
- [ ] W konsoli zaznacz dokładnie te permissions, których używa manifest

## 7. SDK i zależności

- [x] Odpowiedź dla SDK jest przygotowana
- [x] Dla finalnego builda odpowiedź powinna być `No`

## 8. QA przed submission

- [x] `npm test`
- [x] `npm run build:app`
- [x] Browser preview screenshot matrix istnieje
- [x] Smoke test na prawdziwym zegarku round był wykonany
- [x] `ROTARY` nie idzie do release; tryb został usunięty z aktywnego flow
- [ ] Zrób finalny smoke test na prawdziwym zegarku square albo świadomie ogranicz support
- [ ] Sprawdź onboarding:
- [ ] start gry
- [ ] settings
- [ ] scoreboard pusty
- [ ] scoreboard po kilku runach
- [ ] haptics przy kolizji
- [ ] sterowanie `tilt`, `touch`, `swipe`
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

## 10. Co brakuje teraz w repo

- [x] store icon `240x240`
- [x] screenshoty `360x360`
- [x] privacy statement
- [x] listing copy dla `en-US` i `pl-PL`
- [ ] decyzja o regionach publikacji
- [ ] finalny test release na realnym square hardware albo zawężenie supportu

## Źródła

- Zepp app submission flow: https://docs.zepp.com/docs/distribute/
- Zepp CN submission page: https://docs.zepp.com/zh-cn/docs/distribute/
- Zepp icon design spec: https://docs.zepp.com/docs/designs/visual/icons/
- Zepp app manifest reference: https://docs.zepp.com/docs/reference/app-json/
