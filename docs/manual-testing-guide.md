# Przewodnik po testowaniu manualnym — notdemo.trade

## 1. Landing Page (/)

**Co sprawdzic:**
- Nawigacja: logo, linki "Features" i "FAQ" scrolluja do sekcji, toggle jezyka (EN/PL), toggle motywu (light/dark/system), przycisk "Sign In"
- Hero: badge "AI-Powered", "Free AI Tier", "BYOK", opis, przycisk "Get Started" → przekierowuje na `/dashboard`
- Features: 8 kart — AI Analysis, Stocks & Crypto, Discussion Feed, Trade Approval, Risk Guardrails, Performance Tracking, BYOK, Orchestration Modes
- FAQ: 3 karty kategorii (Beginners, Experienced Traders, Developers) → klik prowadzi do `/faq/{categoryId}`
- Footer: lista LLM Providers (Workers AI, OpenAI, Anthropic, Google Gemini, xAI, DeepSeek), link do autora
- Przelaczanie PL/EN — wszystkie tresci sie zmieniaja
- Responsywnosc: mobile / tablet / desktop

---

## 2. Autentykacja

**Rejestracja:**
1. Klik "Get Started" lub "Sign In" → wyswietla sie layout `_auth` z formularzem logowania
2. Przelacz na tryb "Sign Up" (toggle pod formularzem)
3. Pola: email, haslo (min 8 znakow), opcjonalnie imie
4. Po rejestracji → sesja ustawiona, layout renderuje dashboard

**Logowanie:**
1. Email + haslo → po sukcesie widzisz dashboard
2. Bledne dane → alert z komunikatem bledu

**Wylogowanie:**
1. Kliknij awatar w headerze → Account Dialog
2. Przycisk "Sign Out" → powrot do formularza logowania

---

## 3. Dashboard (/dashboard)

**Co powinno sie wyswietlac:**
- Status rynku (open/closed) — banner na gorze
- Podsumowanie konta: equity, cash, buying power (dane z Alpaca)
- Tabela pozycji: otwarte pozycje z P&L (unrealized/realized)
- Tabela orderow: ostatnie 10 zlecen ze statusem
- Timestamp ostatniego odswiezenia danych

**Warunki:**
- **Bez skonfigurowanego Alpaca** → powinien wyswietlic sie odpowiedni stan (brak danych / komunikat)
- **Ze skonfigurowanym Alpaca (paper)** → dane z paper trading account
- Dane odswiezaja sie automatycznie (30s interval)

---

## 4. Ustawienia — Credentials (/settings/credentials)

### Alpaca
1. Formularz: API Key, API Secret (toggle widocznosci), switch Paper/Live
2. "Save & Validate" → walidacja polaczenia z Alpaca
3. Po sukcesie: badge "Connected" + "Paper"/"Live"
4. Blad walidacji → badge "Invalid" + komunikat bledu
5. "Remove" → dialog potwierdzenia z ostrzezeniem o zatrzymaniu handlu

### LLM Providers (5 kart)
Dla kazdego: OpenAI, Anthropic, Google, xAI, DeepSeek:
1. Pole: API Key (toggle widocznosci)
2. "Save & Validate" → walidacja klucza
3. Po sukcesie: badge "Connected", data walidacji
4. "Remove" → dialog potwierdzenia

**Uwaga:** Workers AI nie wymaga klucza — dziala automatycznie przez Cloudflare AI binding.

---

## 5. Ustawienia — Trading Config (/settings/trading)

**3 sekcje w formularzu:**

| Sekcja | Pola | Wartosci domyslne |
|--------|------|-------------------|
| Position Limits | Max positions (1-50), Max position value ($100-$100k), Max notional per trade ($100-$100k) | 10, $5k, $5k |
| Risk Management | Stop Loss % (1-50%), Take Profit % (1-100%), Max Daily Loss % (0.1-10%), Position Size % of cash (1-100%), Cooldown after loss (0-1440 min) | 8%, 15%, 0.2%, 10%, 30min |
| Trading Hours | Trading hours only (bool), Extended hours (bool), Short selling (bool) | true, false, false |

**Co sprawdzic:**
- Procenty wyswietlaja sie live w labelach (np. "Stop Loss (8.0%)")
- Zapis → alert sukcesu/bledu

---

## 6. Ustawienia — AI Models (/settings/models)

**2 sekcje:**

| Pole | Opis | Domyslna wartosc |
|------|------|------------------|
| Research Model | Model do badania rynku i analizy sentymentu | openai/gpt-4o-mini |
| Analyst Model | Model do decyzji handlowych | openai/gpt-4o |

**Co sprawdzic:**
- Dropdowny modeli populuja sie tylko z providerow, dla ktorych masz skonfigurowane credentiale w Credentials
- Jesli brak credentials — dropdown pokazuje biezaca wartosc jako fallback
- Zapis → alert sukcesu/bledu

---

## 7. Ustawienia — API Tokens (/settings/tokens)

**2 typy tokenow:**
1. **Access Token** — ogolny dostep API
2. **Kill Switch Token** — awaryjne zatrzymanie handlu

**Flow:**
1. "Generate Token" → zielony alert z pelnym tokenem + przycisk kopiowania
2. **Token widoczny tylko raz** — po odswiezeniu widac tylko prefix
3. Token wyswietla: prefix, date wygasniecia, date ostatniego uzycia, badge "Active"
4. "Regenerate" → nowy token zastepuje stary
5. "Revoke" → dialog potwierdzenia (`?revoke=access` w URL) → token uniewazniony

---

## 8. Session Agent (/session) — KLUCZOWA STRONA

### Layout
- **Header**: tytul + przycisk Settings (toggle panelu konfiguracji)
- **Status bar**: switch On/Off, licznik cykli, licznik bledow, badge pending proposals, przycisk "Trigger"
- **Glowna tresc (2 kolumny)**:
  - Lewo: Discussion Feed + Chat
  - Prawo: Pending Proposals + Last Error

### Panel Settings (po kliknieciu ikony Settings)

| Ustawienie | Opcje | Domyslne |
|------------|-------|----------|
| Orchestration Mode | Debate / Pipeline (karty do wyboru) | — |
| LLM Provider | workers-ai, openai, anthropic, google, xai, deepseek | workers-ai |
| LLM Model | pole tekstowe | — |
| Watchlist Symbols | tekst rozdzielony przecinkami → wyswietlane jako badge | — |
| Broker Type | alpaca, paper trading | — |
| Analysis Interval | 30-3600 sec | — |
| Min Confidence | 0-1, step 0.05 | — |
| Position Size | 0.01-0.5 (% cash) | — |
| Debate Rounds | 1-5 | — |
| Proposal Timeout | 60-3600 sec | — |
| Strategy ID | pole tekstowe | — |

### Scenariusz testowy: Debate Mode
1. W Settings wybierz **Debate** jako orchestration mode
2. Ustaw provider na **workers-ai** (nie wymaga klucza)
3. Dodaj symbole do watchlist (np. "AAPL, TSLA")
4. Wlacz agenta (switch On)
5. Kliknij "Trigger" aby recznie uruchomic analize

**Oczekiwany discussion feed:**
```
[system]     → "Starting 3-persona debate analysis..."
[Bull]       → Analiza bycza z action, confidence, key points
[Bear]       → Analiza niedzwiedzia z kontrargumentami
[Risk Mgr]   → Ocena ryzyka
--- Runda debaty 1 ---
[Bull]       → Odpowiedz na kontrargumenty
[Bear]       → Rewizja pozycji
[Risk Mgr]   → Zaktualizowana ocena
--- (kolejne rundy jesli >1) ---
[Moderator]  → Consensus: finalna rekomendacja z confidence score
[system]     → Trade proposal (jesli confidence >= threshold)
```

**Kolory wiadomosci wg sender:**
- system → szary
- data_agent → niebieski
- analysis_agent → fioletowy
- persona (Bull) → zielony, (Bear) → czerwony, (Risk Mgr) → zolty
- moderator → bursztynowy
- user → indygo

### Scenariusz testowy: Pipeline Mode
1. Zmien orchestration mode na **Pipeline**
2. Trigger analize

**Oczekiwany feed:**
```
[data_agent]     → Fetch 200 daily bars
[analysis_agent] → Technical indicators + signals
[analysis_agent] → LLM recommendation
[analysis_agent] → Risk validation (check portfolio limits)
[system]         → Proposal generated (jesli passes risk + action ≠ hold)
```

### Trade Approval Flow
1. Gdy propozycja sie pojawi → karta w prawej kolumnie:
   - Kierunek (BUY/SELL), symbol, confidence % (kolor: zielony >0.7, zolty 0.4-0.7, czerwony <0.4)
   - Rationale (tekst)
   - Siatka: Entry Price, Target Price, Stop Loss, Position Size %, Qty, Notional
   - Lista ryzyk
   - **Countdown timer** (domyslnie 15 min do wygasniecia)
   - Przyciski: **Approve** / **Reject**
2. Klik "Approve" → broker wykonuje zlecenie → status zmienia sie na "Approved" z timestampem
3. Klik "Reject" → status "Rejected"
4. Brak akcji → po uplywie timeout → status "Expired"
5. **Zadna transakcja nie wykonuje sie bez zatwierdzenia**

### Chat Interface
- Pole tekstowe na dole: "Ask the agent to analyze a symbol, check positions, etc."
- Wiadomosci uzytkownika → prawo, primary background
- Odpowiedzi agenta → lewo, muted background
- Agent ma narzedzia: `analyzeSymbol(symbol)`, `executeTrade(proposalId, approved)`

---

## 9. Analysis (/analysis/$symbol)

**Jak sie dostac:** sidebar → Analysis, lub wpisz URL np. `/analysis/AAPL`

**Co powinno sie wyswietlac:**
- Header: link "Back", nazwa symbolu + aktualna cena, selector timeframe (1m, 5m, 15m, 1h, 1D)
- **Price Chart** (lightweight-charts): swieczki OHLC, histogram volume, 3 SMA (20 niebieska, 50 pomaranczowa, 200 fioletowa)
- **4 panele wskaznikow:**
  - RSI (14): wartosc 0-100, pasek, kolorowanie (zielony <30 oversold, czerwony >70 overbought)
  - MACD: linia MACD, signal, histogram (zielony/czerwony)
  - ATR (14): wartosc $ + % ceny
  - Volume: relative volume (current/SMA20), podswietlone zolto jesli >2x
- **Lista sygnalow**: posortowana wg sily, z ikona kierunku (▲ bullish, ▼ bearish), pasek sily

**Dane odswiezaja sie co 60s** (staleTime + refetchInterval)

**Zmiana timeframe** → ponowne pobranie danych + przerysowanie wykresu

**Dark mode**: chart automatycznie zmienia kolory (tlo, grid, swieczki)

---

## 10. Performance (/performance)

### Cold Start
Jesli <5 rozstrzygniętych transakcji → wyswietla sie komunikat z progress barem: "Potrzebujesz jeszcze X rozstrzygniętych transakcji..."

### Po wystarczajacej ilosci danych

**Header:** tytul, opis, selector okna (30d / 90d / 180d), przycisk Refresh

**Glowna tresc (2+1 kolumny):**

**Lewa strona:**
- **Score Cards** (po jednej na persone w debate mode / strategie w pipeline mode):
  - Persona ID/nazwa
  - Badge kalibracji: Good (>=0.5, zielony), Fair (0.2-0.5, zolty), Poor (<0.2, czerwony)
  - Win Rate (% + count), Avg Return (%), Sharpe Ratio
  - Best/Worst symbol z return %
- **Pattern Highlights**: wykryte wzorce (indicator_outcome, market_regime, sector, symbol) z success rate i avg P&L

**Prawa strona:**
- **Active Positions**: live P&L z animowana kropka "Live", aktualna cena, unrealized P&L ($ + %)
- **Outcome History Feed**: lista rozstrzygniętych transakcji:
  - Ikona ▲/▼ (zielona/czerwona)
  - Symbol, BUY/SELL badge, exit reason (Stop Loss, Target Hit, Manual, Time Exit)
  - Sciezka ceny: "$entry → $exit"
  - Czas trzymania
  - Return % + P&L

**Dane odswiezaja sie co 60s** (snapshots co 30s)

---

## 11. Profile (/profile)

- Wyswietla: imie, email, awatar
- Edycja profilu uzytkownika

---

## 12. Nawigacja ogolna

**Sidebar (desktop):**
- Dashboard, Session Agent, Analysis, Performance
- Settings: Credentials, API Tokens, Trading Config, AI Models, Profile
- Sidebar jest zwijany (collapse toggle)
- Aktywna strona podswietlona kolorem primary

**Kazda podstrona settings/profile** posiada link "Back to Dashboard" na gorze.

---

## Najwazniejsze scenariusze end-to-end

### Scenariusz A: Nowy uzytkownik, zero config
1. Landing → Sign Up → Dashboard (puste dane, brak Alpaca)
2. Credentials → dodaj Alpaca paper keys → Connected
3. Dashboard → dane konta powinny sie pojawic
4. Session → wlacz agenta z Workers AI (bez dodatkowych kluczy)
5. Dodaj symbol do watchlist → Trigger → discussion feed powinien dzialac

### Scenariusz B: Pelny flow z trade approval
1. Skonfiguruj Alpaca + przynajmniej jeden LLM provider
2. Session → Debate mode → ustaw watchlist → wlacz → trigger
3. Czekaj na propozycje → przegladaj discussion feed
4. Approve → sprawdz czy order pojawil sie w Dashboard (orders)
5. Performance → sprawdz outcome tracking

### Scenariusz C: Pipeline mode
1. Zmien orchestration na Pipeline
2. Trigger → sprawdz 5-krokowy feed
3. Porownaj z Debate (inna struktura wiadomosci, brak debaty)

### Scenariusz D: Expiration
1. Trigger analize → poczekaj na propozycje
2. Nie podejmuj decyzji → czekaj na countdown → status "Expired"

### Scenariusz E: Multi-language
1. Przelacz na PL na landing page
2. Sprawdz czy wszystkie tresci sie zmienily
3. Zaloguj sie → dashboard i inne strony powinny byc w ustawionej lokalizacji
