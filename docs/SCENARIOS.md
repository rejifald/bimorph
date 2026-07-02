# bimorph — Real-world scenarios

Gathered to pressure-test the design. ~28 scenarios across five domains, tagged by
invertibility hazard. "Stress" = the design feature the scenario exercises.

Hazard legend: **clean-iso** · **lossy / precision-loss** · **duplicate-collision** ·
**missing-value** · **read-only-field** · **many-to-one** · **ambiguous-parse** ·
**empty-vs-undefined**

---

## A. API DTOs & database / ORM boundary

| # | Scenario | A (domain) ↔ B (wire) | Hazard | Stress |
|---|---|---|---|---|
| A1 | Money | `Money.of(19.99,"USD")` ↔ `{price_cents:1999,currency:"USD"}` | lossy | creation-diagnostic (JPY 0-dp, BHD 3-dp drift) |
| A2 | Status enum | `OrderStatus.AwaitingPayment` ↔ `"PENDING_PAYMENT"` (+legacy `"PENDING"`,`"AWAITING_PAYMENT"`) | duplicate-collision | resolver + alias |
| A3 | Nullable column | `{deletedAt?:Date}` ↔ `{deleted_at:null\|"..."}` | clean-iso | none (regression anchor) |
| A4 | Server audit fields | `CreateUserInput{email,name}` ↔ row `{id,created_at,updated_at,...}` | read-only-field | encode-omit |
| A5 | snake↔camel nested | `{shippingAddress:{postalCode,addressLine1}}` ↔ `{shipping_address:{postal_code,line_1}}` | missing-value | validate-door |

## B. Frontend / UI state

| # | Scenario | A (domain) ↔ B (wire) | Hazard | Stress |
|---|---|---|---|---|
| B1 | Filter ↔ URL query | `{sort:"price_desc",page:2,tags:["sale","new"]}` ↔ `?sort=price_desc&page=2&tags=sale,new` | empty-vs-undefined | encode-omit (drop `page=1` default) |
| B2 | Form string ↔ value | `{birthDate:Date,age:34,subscribed:true}` ↔ `{birthDate:"1990-05-14",age:"34",subscribed:"on"}` | lossy (`"014"`→14) | validate-door |
| B3 | `<select>` ↔ entity | `{id:"usr_8f2a",name,role}` ↔ `"usr_8f2a"` | missing-value (stale/deleted id) | **resolver + contextual (live collection)** |
| B4 | Checkbox group ↔ enum | `{visibility:"public"}` ↔ `{public:true,private:false,unlisted:false}` | many-to-one (all-false / two-true invalid) | **group (N↔1) + resolver** |
| B5 | i18n label ↔ code | `"draft"` ↔ `"Чернетка"` (locale uk) | duplicate-collision (two codes → one label) | creation-diagnostic per-locale |
| B6 | localStorage ↔ prefs | `{theme,sidebarCollapsed,lastSyncedAt:Date}` ↔ `'{"theme":"dark",...}'` (no `lastSyncedAt`) | read-only-field | encode-omit |

## C. Units, formats & encodings

| # | Scenario | A ↔ B | Hazard | Stress |
|---|---|---|---|---|
| C1 | Hex ↔ RGB/named | `#ff0000` ↔ `"red"` / `rgb(255,0,0)` | duplicate-collision (`grey`/`gray`→`#808080`) | creation-diagnostic + resolver (canonical name) |
| C2 | Celsius ↔ Fahrenheit | `20°C` ↔ `68°F` | precision-loss (rounded storage) | validate-door (range) / clean if full precision |
| C3 | Bytes ↔ human | `1610612736` ↔ `"1.5 GB"` | many-to-one | resolver (canonical byte count) + lossy-warn |
| C4 | ISO ↔ epoch | `"2026-07-02T14:30:00+02:00"` ↔ `1751459400` | lossy (offset + ms lost) | **contextual (target tz)** + encode-omit derived |
| C5 | Percent-encoding | `"café du jour"` ↔ `"caf%C3%A9%20du%20jour"` | many-to-one (`%20` vs `+`, `%7E` vs `~`) | creation-diagnostic + resolver + validate |
| C6 | Compass ↔ signed angle | `-10°` ↔ `350°` | clean-iso w/ boundary collision (`0`≡`360`) | creation-diagnostic (0/360) |

## D. Protocols, config & legacy interop

| # | Scenario | A ↔ B | Hazard | Stress |
|---|---|---|---|---|
| D1 | HTTP status | `"NotFound"` ↔ `404` | many-to-one (`400`/`422`→ValidationError legacy) | resolver + creation-diagnostic |
| D2 | Feature-flag aliases | `FeatureFlag.SearchUiV2` ↔ `"new-search-ui"`/`"newSearchUI"`/`"search_ui_v2"` | duplicate-collision (deprecated aliases) | **alias** + encode-omit |
| D3 | gRPC enum ↔ int | `OrderStatus.SHIPPED` ↔ `2` | clean-iso; missing on newer wire int | resolver (unknown variant) + validate |
| D4 | CSV row | `{name,email,phone:null,status}` ↔ `"Jane Doe,jane@x.com,,active"` | lossy (`""`/`null`/`undefined` collapse) | validate-door (per-row) + encode-omit |
| D5 | Env vars ↔ config | `{logLevel:"warn",maxRetries:3,isProduction}` ↔ `LOG_LEVEL="warn",MAX_RETRIES="3"` | read-only-field (derived `isProduction`) | encode-omit + creation-diagnostic (unmapped field) |
| D6 | Event envelope | `UserCreatedEvent` ↔ `"user.created.v1"` (+legacy `"user_created"`) | duplicate-collision (versioned alias) | **alias** + resolver |

## E. Gnarly domain codes (limit-pushers)

| # | Scenario | A ↔ B | Hazard | Stress |
|---|---|---|---|---|
| E1 | IANA tz ↔ UTC offset | `"America/New_York"` ↔ `-05:00`/`-04:00` | many-to-one, **genuinely not invertible** | **contextual (instant) + resolver; creation-diagnostic CANNOT catch (data-dependent DST)** |
| E2 | Bitmask ↔ roles | `["write","execute"]` ↔ `0b110` | clean-iso → lossy w/ unknown bits | creation-diagnostic (bit gaps) + validate (unknown bits) |
| E3 | E.164 ↔ national | `"+14155552671"` ↔ `"(415) 555-2671"` | ambiguous-parse (no country in national form) | **contextual (region)**; not a table problem |
| E4 | "First Last" ↔ {first,last} | `{first:"Mary",last:"Jane Watson"}` ↔ `"Mary Jane Watson"` | ambiguous-parse, **fundamentally not invertible** (particles, mononyms, CJK) | **partial** (encode clean, decode guesswork) + validate low-confidence |
| E5 | Currency symbol ↔ ISO 4217 | `"JPY"` ↔ `"¥"` | duplicate-collision (`$`→USD/CAD/AUD; `¥`→JPY/CNY) | creation-diagnostic hard-fail + **contextual (locale)** |
| E6 | Slug ↔ title | `"The Lord of the Rings"` ↔ `"the-lord-of-the-rings"` | lossy (case/punct/diacritics stripped) | **partial**, decode never throws (best-effort, DB is truth) |
