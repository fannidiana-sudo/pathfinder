# Pathfinder — telepítési útmutató

AI-alapú karrier/vállalkozás quiz funnel: 18 kérdés → archetípus → $5 Stripe fizetés → személyre szabott Claude-elemzés.

## Architektúra

```
Böngésző (index.html)
   │  kvíz kitöltése → válaszok a sessionStorage-ba
   ▼
Stripe Payment Link ($5)  ──sikeres fizetés──►  visszairányítás ?session_id=...
   │
   ▼
/.netlify/functions/analyze
   ├─ 1. Stripe API-val ellenőrzi: tényleg fizetett-e (payment_status === "paid")
   ├─ 2. Anthropic API-t hívja (a kulcs CSAK a szerveren él)
   └─ 3. visszaadja a JSON elemzést → a böngésző kirajzolja
```

## Beállítás lépésről lépésre (~30 perc)

### 1. Stripe Payment Link létrehozása
1. Stripe Dashboard → **Payment Links** → **New**
2. Termék: "Pathfinder Analysis", ár: **$5.00**, one-time
3. **After payment** fülön: *Redirect customers to your website* →
   `https://A-TE-DOMAINED.netlify.app/?session_id={CHECKOUT_SESSION_ID}`
   ⚠️ A `{CHECKOUT_SESSION_ID}` placeholder kötelező, szó szerint így — a Stripe ezt cseréli ki a valódi session ID-ra, ebből ellenőrzi a szerver a fizetést.
4. Másold ki a Payment Link URL-t (`https://buy.stripe.com/...`)

### 2. Frontend konfigurálása
Az `index.html` tetején, a CONFIG blokkban:
- `STRIPE_PAYMENT_LINK` → illeszd be a linkedet
- `TEST_MODE` → hagyd `true`-n tesztelésig, **élesítés előtt állítsd `false`-ra**

### 3. Netlify deploy
A functions miatt **git-alapú deploy** vagy **Netlify CLI** kell (a sima drag&drop nem viszi fel a functionöket):
```bash
# Netlify CLI-vel:
npm install -g netlify-cli
cd pathfinder
netlify deploy --prod
```
Vagy: pushold a mappát egy GitHub repóba → Netlify → "Import from Git".

### 4. Környezeti változók (Netlify → Site settings → Environment variables)
| Változó | Honnan | Megjegyzés |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | soha ne kerüljön a frontendbe |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com/apikeys | teszthez `sk_test_...`, éleshez `sk_live_...` |
| `ALLOW_TEST_PAYMENTS` | te állítod: `true` | **élesítés előtt töröld!** |

Változó-módosítás után: **Deploys → Trigger deploy**, hogy érvénybe lépjen.

### 5. Tesztelés
1. `ALLOW_TEST_PAYMENTS=true` + `TEST_MODE=true` → a paywall alatt megjelenik a "Simulate payment" gomb, fizetés nélkül teszteled a teljes flow-t
2. Stripe **test mode**-ban (sk_test kulccsal + test Payment Linkkel) próbafizetés a `4242 4242 4242 4242` tesztkártyával
3. Élesítés: `TEST_MODE=false` az index.html-ben, `ALLOW_TEST_PAYMENTS` törlése, `sk_live_` kulcs + éles Payment Link

## Költségek és marzs
- Anthropic API: egy elemzés ~1500 input + ~1000 output token Sonnettel → jóval 1 cent alatt / vásárló
- Stripe díj $5-nál: ~$0.45
- **Marzs vásárlónként: ~$4.5 (90%+)**

## Ismert korlátok (MVP-szint, tudatosan)
- Egy kifizetett `session_id` 24 órán belül újra felhasználható elemzés-generálásra (retry-barát; visszaélésre elhanyagolható kitettség $5-nál). Ha zavar: Netlify Blobs-ba mentsd a felhasznált session ID-kat.
- Az email jelenleg a function logba íródik (`LEAD:` sor) + a Stripe-ban is megvan minden vásárló emailje. Következő lépés: Mailerlite/Beehiiv API-hívás a functionben.
- Ha a vásárló másik böngészőben tér vissza a Stripe-ról, a válaszai elvesznek (sessionStorage) — erre a UI kulturált hibaüzenetet ad. Megoldás később: válaszok mentése szerverre fizetés előtt.

## Élesítési checklist
- [ ] `TEST_MODE = false` az index.html-ben
- [ ] `ALLOW_TEST_PAYMENTS` env változó TÖRÖLVE
- [ ] `sk_live_` Stripe kulcs beállítva
- [ ] Éles Payment Link beállítva, redirect URL-ben `{CHECKOUT_SESSION_ID}`
- [ ] Próbavásárlás valódi kártyával ($5 — refundolhatod magadnak)
- [ ] ÁSZF + adatkezelési tájékoztató link a landingen (EU-s fogyasztóvédelem!)
