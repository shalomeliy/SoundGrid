# PLAN — v0.7.0: FX Units (סיבוב ראשון)

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר 09/10). ה-spec כבר סגר את כל ההחלטות
המוצריות — התוכנית הזו היא רק "איך", קובץ-אחרי-קובץ, מבוססת על קריאה מלאה של הקוד הקיים
(`engine.ts`, `deck.ts`, `mapping.ts`, `controls.ts`, `manager.ts`, `flx4.ts`, `hints.ts`,
`Mixer.tsx`, `sampler-idb/store.ts`, `App.tsx`). **מחליפה** את התוכן הישן שהיה כאן (`PLAN.md`
של v0.5.5).

**תזכורת מפורשת מהמשתמש (09/10):** v0.6.0 (הסאמפלר) יצא עם כמה באגים אחרי הסגירה, כולל
אחד שסקירה עצמאית תפסה. הפלאן הזה מוסיף במפורש **בדיקות רגרסיה** — לא רק "החדש עובד", גם
"הישן לא זז" — ר' סעיף 6 ו-8.

## תגלית תכנון אחת שדורשת ציון: התנגשות שם "Filter"

תוך כדי קריאת `Mixer.tsx` התגלה שכבר קיים היום כפתור "Filter" על כל ערוץ (`ChannelStrip`,
שורה 68: `ctl.setFilter(deckId, v)` → `deck.ts`'s `lpf`/`hpf`, סטטי, תמיד פעיל). זה לא נתפס
באף אחת מ-4 הסקירות. **נסגר מול שלום (09/10): ה-FX "Filter" הוא פילטר-סוויפ אוטומטי
(LFO מסונכרן-ביט) — יצור נפרד לגמרי, לא נוגע ב-`deck.ts`'s `lpf`/`hpf` הקיימים.** שני
השמות "Filter" יישארו זה לצד זה במיקסר (אחד ידית סטטית, אחד toggle ב-FX rack) — לא בעיה
כי הם ב-UI מבחין (ידית לעומת שורת כפתורים).

## 1. ארכיטקטורה נוכחית וזרימת נתונים רלוונטית

```
Deck A: trim→eqLow→eqMid→eqHigh→hpf→lpf→channelGain──┬─→ faderGain ─┐
Deck B: (אותו דבר)                                    └─→ cueGain  ─┼─→ cueBus
samplerBus ─────────────────────────────────────────────────────────┼─→ masterBus
                                                                     ┘
masterBus ──(wireOutput, engine.ts:95 & :106, ישיר היום)──→ destination
```

`controls.ts` הוא צוואר הבקבוק היחיד: UI ו-MIDI (`manager.ts`'s `dispatch`) קוראים אליו,
אף אחד לא נוגע ב-`engine`/`deck` ישירות. `core/mapping/mapping.ts` מגדיר את ה-`ControlAction`
היחיד שגם UI וגם MIDI מדברים בו. `core/hints.ts` + `core/mapping/flx4-labels.ts` נבדקים זה
מול זה ב-`tests/core/hints.test.ts` ("FLX4 label drift") — כל `ControlAction` חדש שנקשר
ב-`flx4.ts` **חייב** תווית ב-`flx4-labels.ts` אחרת הבדיקה נופלת.

## 2. הפרוסה הדקה מקצה-לקצה

הכי קטן שמוכיח את כל השרשרת: הדלקת Delay 1/4 על דק A מהעכבר → נשמע גם ב-cue → נשמע במאסטר →
שורד רענון. זה כבר עובר דרך כל שכבה (core math → platform FX node → deck insert → store →
persistence), בלי לחכות ל-4 האפקטים או לחיווט FLX4. נבנה ראשון, שאר האפקטים/חיווט/UI נבנים
עליו.

## 3. קבצים מדויקים — מה משתנה ולמה

### 3.1 `src/core/fx.ts` (חדש, טהור — בלי DOM/AudioContext)
- `export const FX_EFFECTS = ['delay', 'echo', 'reverb', 'filter'] as const` + `type FxEffect`
- `export const FX_TIME_STEPS = [0.25, 0.5, 1, 2, 4] as const` (בבתי-שיר)
- `export function beatFractionToSeconds(bpm: number | null, fraction: number): number` —
  `bpm && bpm > 0 ? (60 / bpm) * fraction : 0.5` (fallback סביר, לא NaN/Infinity)
- `export function equalPowerMix(t: number): { dry: number; wet: number }` — **מופק מ-
  `engine.ts:250-257`'s `setCrossfader`**, לא משוכפל: `{ dry: Math.cos((t*PI)/2), wet:
  Math.cos(((1-t)*PI)/2) }`. `engine.ts`'s `setCrossfader` ממשיך לקרוא לפונקציה הזו במקום
  לחשב בעצמו — **שינוי שקוף, בלי לגעת בהתנהגות הקיימת** (ר' 6.1, בדיקת רגרסיה).

### 3.2 `tests/core/fx.test.ts` (חדש)
- `beatFractionToSeconds(128, f)` מול 5 הערכים המדויקים (0.1172, 0.2344, 0.46875, 0.9375,
  1.875 שניות, ±0.0001)
- `beatFractionToSeconds(null, 0.25)` → לא NaN, לא Infinity, לא שלילי
- `equalPowerMix(0)` / `(0.5)` / `(1)` מול הערכים ש-`setCrossfader` היה מייצר היום ב-x=-1/0/1
  — **בדיקת רגרסיה מפורשת על הקרוספיידר הקיים**, לא רק על FX (בקשת שלום)

### 3.3 `src/core/mapping/mapping.ts`
- הוספה ל-`ControlAction`: `'fxEffect' | 'fxWetDry' | 'fxTime' | 'fxOn' | 'fxRoute'`
- הוספה ל-`Binding`: `rack?: 0 | 1` (FX racks גלובליים, לא לפי דק כמו `deck?: DeckId`)
- **בלי לגעת בשום `ControlAction`/שדה קיים** — תוספת טהורה, `tsc -b` הוא הבדיקה.

### 3.4 `src/core/mapping/flx4-labels.ts`
- 5 רשומות חדשות ב-`FLX4_LABELS` (`fxEffect`, `fxWetDry`, `fxTime`, `fxOn`, `fxRoute`),
  חלקן `(param) => ...` (למשל `fxEffect` מציג את שם האפקט לפי `FX_EFFECTS[param]`) — נדרש
  כדי ש-`tests/core/hints.test.ts`'s "FLX4 label drift" יישאר ירוק ברגע שנוספים binding-ים
  ב-3.9.

### 3.5 `src/core/hints.ts`
- 5 `HintId` חדשים (`fx.effect`, `fx.wetDry`, `fx.time`, `fx.on`, `fx.route`), כל אחד עם
  `action` שמצביע לרשומה המתאימה ב-3.3 — אותו מנגנון בדיוק כמו כל שאר האפליקציה, שום
  שינוי ל-`HintIcon`/`hint()` עצמם.

### 3.6 `src/platform/audio-webaudio/fx.ts` (חדש)
מחלקת `FxRack` — **כל ה-wet/dry וה-on/off קורים בפנים**, כלפי חוץ זה סתם insert טורי
(input→output), בדיוק כמו פדאל אפקט:

- `input: GainNode`, `output: GainNode` — הממשק היחיד כלפי חוץ.
- `dryGain`/`wetGain` פנימיים: `input` מתפצל לשניהם, שניהם מתחברים ל-`output`.
  `equalPowerMix` (מ-3.1) קובע את שני ה-gains לפי wet/dry knob.
- 4 תת-גרפים, **nodes טבעיים בלבד, בלי AudioWorklet**, נבנים פעם אחת ב-constructor
  (זולים, לא worklet) ומחוברים/מנותקים מ-`wetGain` לפי `setEffect`:
  - **Delay** (index 0): `DelayNode` + `GainNode` feedback (~0.35)
  - **Echo** (index 1): `DelayNode` + `BiquadFilterNode` (lowpass, ~2kHz) בתוך לולאת ה-feedback
    — אותו רעיון כמו Delay, הד "מתעמעם" בגלל הפילטר בלולאה
  - **Reverb** (index 2): `ConvolverNode` עם impulse response **מיוצר בקוד** (רעש לבן מעוצב
    בדעיכה אקספוננציאלית ב-`OfflineAudioContext` או ישירות ל-buffer) — **לא קובץ חיצוני**,
    עומד מול "אפס נכסים ממוצר מסחרי" (`CLAUDE.md`)
  - **Filter** (index 3, **הפילטר-סוויפ שנסגר למעלה**): `BiquadFilterNode` (lowpass, Q~4)
    + `OscillatorNode` (sine) מחובר ישירות ל-`frequency` AudioParam של הפילטר (טכניקת
    audio-rate modulation סטנדרטית) + `GainNode` שקובע את עומק הסוויפ (טווח תדר)
- `setEffect(i: number)`: מנתק את התת-גרף הפעיל מ-`wetGain`, מחבר את הבא. Reverb: אם יצירת
  ה-buffer נכשלה ב-constructor, `setEffect(2)` **לא מתחבר** ומסמן `reverbAvailable = false`
  (חשוף כ-getter) — UI מציג "Reverb לא זמין" (ר' 3.10), לא נופל בשקט לסיגנל יבש בלי הודעה.
- `setWetDry(v: number)`: `equalPowerMix(v)` על `dryGain`/`wetGain`, `setTargetAtTime` (לא
  step) — עקבי עם כל שאר ה-gain changes בקודבייס.
- `setTime(fraction: number, bpm: number | null)`: מעדכן את הפרמטר התלוי-זמן של האפקט
  הפעיל — `delayTime` ל-Delay/Echo, `oscillator.frequency = 1 / beatFractionToSeconds(...)`
  ל-Filter. **Reverb: מניח שכרגע "זמן" משפיע על משך הדעיכה של ה-IR (סקאלה של הפרוצדורה
  לפי `beatFractionToSeconds`) — הנחה טכנית שלי, לא נבדקה מול שלום, קלה לשנות בלי לגעת
  בשאר המנוע אם יתברר שלא מתאים בשמיעה.**
- `setOn(on: boolean)`: **לא reconnect** — ramp פנימי של תרומת ה-wet ל-0/1. כשכבוי,
  `dryGain` נשאר על 1 ו-`output` = `input` בפועל (שקוף לחלוטין). זה מה שהופך
  on/off (תכוף, בזמן מיקס חי) לזול וללא קליק, לעומת ניתוב (נדיר, כן דורש reconnect —
  ר' 3.7).

### 3.7 `src/platform/audio-webaudio/deck.ts`
- Deck A מזוהה קבוע עם rack 0, Deck B עם rack 1 (**החלטת יישום שלי** — הכי פשוט, תואם
  את "שני racks, אחד לכל דק" שכבר ב-spec; לא דורש UI לבחירת "איזה rack על איזה דק").
- node חדש `fxSeam: GainNode`, מוחלף בתוך השרשרת הקיימת:
  ```
  channelGain.connect(this.fxSeam)     // היה: channelGain.connect(faderGain) + connect(cueGain)
  this.fxSeam.connect(this.faderGain)
  this.fxSeam.connect(this.cueGain)
  ```
  כברירת מחדל `channelGain` מחובר ישירות ל-`fxSeam` (bypass, gain=1) — **cue ו-master
  שומעים בדיוק מה ששמעו היום** כל עוד אין rack מנותב לערוץ הזה (ר' בדיקת רגרסיה 6.2).
- `setChannelFxInsert(rack: FxRack | null)`: כשלא-null, מנתק `channelGain→fxSeam` הישיר,
  מחבר `channelGain→rack.input` ו-`rack.output→fxSeam`. כשnull, חוזר ל-bypass. נקרא רק
  מ-`engine.ts` (לא נחשף ל-`controls.ts` ישירות) בתגובה לשינוי ניתוב — **לא** בכל
  הדלקה/כיבוי של FX (זה קורה בפנים ל-FxRack, ר' 3.6).

### 3.8 `src/platform/audio-webaudio/engine.ts`
- `masterPostFx: GainNode` — חדש, קבוע. `wireOutput()` (שורות 95, 106) קורא ממנו במקום
  מ-`masterBus` ישירות. זו גם נקודת ה-tap היציבה ש-v0.7.5 (הקלטה) תזדקק לה.
- `fx: [FxRack, FxRack]` — שני מופעים, נוצרים ב-constructor.
- `setFxRouting(rack: 0 | 1, target: 'channel' | 'master')`:
  - `target === 'channel'`: `decks[rack === 0 ? 'A' : 'B'].setChannelFxInsert(fx[rack])`,
    ומוודא שאותו rack **לא** גם מחובר למאסטר (`rebuildMasterChain` בלי אותו rack).
  - `target === 'master'`: מנתק אותו rack מהדק שלו (`setChannelFxInsert(null)`), ומכניס
    אותו ל-`rebuildMasterChain`.
  - `rebuildMasterChain()`: מנתק הכל בין `masterBus` ל-`masterPostFx`, מחבר מחדש
    `masterBus → [racks שמנותבים למאסטר, לפי סדר rack 0 ואז rack 1] → masterPostFx`
    (או ישירות אם אף rack לא שם) — **אותה שיטת נתק-וחבר-מחדש ש-`wireOutput()` כבר
    עושה** על שינוי התקן פלט (עקבי עם הקודבייס, לא דפוס חדש).
  - ה-reconnect קורה **רק כששינוי ניתוב קורה** (נדיר), לא על כל on/off (תכוף) — ר' 3.6.
- **בדיקת רגרסיה קריטית (בקשת שלום):** כש-`masterPostFx` נכנס, כל מה שהיה מחובר ל-
  `masterBus` (שני הדקים, הסאמפלר) חייב להמשיך להישמע בדיוק כמו היום — ר' 6.3.

### 3.9 `src/controls.ts`
5 פונקציות choke-point חדשות, אותו דפוס כמו `setFilter`/`toggleLoop` הקיימים:
```ts
export function setFxEffect(rack: 0 | 1, index: number) {
  engine.fx[rack].setEffect(index)
  useStore.getState().patchFx(rack, { effect: index })
  void persistFxSettings()
}
export function setFxWetDry(rack: 0 | 1, v: number) { /* אותו דפוס */ }
export function setFxTime(rack: 0 | 1, fraction: number) { /* מזין גם BPM נוכחי מה-clock */ }
export function toggleFxOn(rack: 0 | 1) { /* engine.fx[rack].setOn(!prev) */ }
export function setFxRoute(rack: 0 | 1, target: 'channel' | 'master') {
  engine.setFxRouting(rack, target)
  useStore.getState().patchFx(rack, { route: target })
  void persistFxSettings()
}
```
`persistFxSettings()` שומר את שני ה-racks ל-idb-keyval (ר' 3.11), עקבי עם דפוס הסאמפלר
(`saveSamplerBank` נקרא אחרי כל שינוי מבני, לא debounce — ר' `controls.ts:1053,1406`).

### 3.10 UI — `src/app/components/Mixer.tsx`
`FxStrip({ rack, deckColor })` חדש, אותו קובץ (לא קובץ נפרד — `SamplerStrip` כבר יושב שם,
אותה שכבה): שורת בחירת אפקט (4 `Button variant="toggle" size="sm"`, אותה תבנית כמו
`PadGrid`'s mode row), `Knob` ל-wet/dry (כמו EQ knobs), שורת זמן (5 `Button` קטנים ל-
FX_TIME_STEPS), `Button` on/off עם זוהר כשדלוק (כמו Cue Monitor של הסאמפלר), toggle דו-מצבי
ערוץ/מאסטר. כל control מקבל `HintIcon` מה-`HintId`-ים החדשים (3.5). כשReverb לא זמין
(`engine.fx[rack].reverbAvailable === false`) — כפתור הבחירה שלו מושבת עם tooltip "Reverb
unavailable", לא נעלם בשקט.
מוצב ב-`<div className="flex items-start gap-4">` הקיים (`Mixer.tsx:106-110`), בין
`ChannelStrip` לזה שמתאים לו ל-`SamplerStrip` — לא פאנל חדש בגובה מלא (אין מקום, ר' סקירת
העיצוב).

### 3.11 `src/platform/fx-idb/store.ts` (חדש, תיקיה חדשה)
אותו דפוס בדיוק כמו `sampler-idb/store.ts`: `getFxSettings()`/`saveFxSettings()` על
מפתח `idb-keyval` יחיד (`soundgrid:fx:racks`), אף פעם לא throw על read, throw על write
(השכבה שמעל מטפלת). מבנה: `[{ effect, wetDry, time, on, route }, {...}]` (שני racks,
index-aligned). נקרא ב-boot (כמו `getSamplerBank`) ומוחל על `engine.fx[i]` + store.

### 3.12 `src/platform/transport-webmidi/mappings/flx4.ts`
5 binding-ים חדשים לכל rack (10 סה"כ), על CC/note לא בשימוש בערוץ 6 (מיקסר) —
**לא מאומתים על חומרה אמיתית**, אותו סטטוס כמו `shift`/`padMode` שכבר ב-קובץ הזה
("Not hardware-confirmed" בהערה). `beat knob` (זמן) → `fxTime` מצב `absolute`, כפתורי
on → `fxOn` מצב `button`, paddle → `fxEffect`/`fxRoute` לפי המספר הפיזי של הכפתורים
שקיימים בפועל על ה-FLX4 (לא נבדק כאן — יסומן ב-`HANDOFF.md` כחוב, בדיוק כמו 4
הבינדינגים הלא-מאומתים מ-v0.5.0).

### 3.13 `src/platform/transport-webmidi/manager.ts`
5 `case`-ים חדשים ב-`dispatch`, אותו דפוס בדיוק כמו `case 'filter'`/`case 'loopToggle'`:
```ts
case 'fxEffect':
  if (value > 0 && b.rack != null && b.param != null) ctl.setFxEffect(b.rack, b.param)
  break
case 'fxWetDry':
  if (b.rack != null) ctl.setFxWetDry(b.rack, unipolar(value, b.invert))
  break
// fxTime, fxOn, fxRoute — אותו דפוס
```

## 4. שינויי API/טיפוסים והתנהגות כשלים

| שינוי | כשל אפשרי | התנהגות |
| --- | --- | --- |
| `ConvolverNode` buffer ל-Reverb | יצירת ה-buffer נכשלת (זיכרון/דפדפן) | `reverbAvailable=false`, UI חוסם בחירה, שאר 3 האפקטים לא מושפעים |
| `masterPostFx` node חדש | אין — GainNode רגיל, לא יכול להיכשל בבנייה | — |
| `fxSeam` node חדש בכל דק | אין — GainNode רגיל | bypass=gain 1, שקוף |
| `rebuildMasterChain`/`setChannelFxInsert` | reconnect לא-אטומי (disconnect ואז connect הם 2 קריאות נפרדות) | חלון קצר מאוד (JS single-thread, אין audio thread contention על הקריאות עצמן) — לא נדרש declick כאן כי זה קורה רק על **שינוי ניתוב**, שכבר עובר ramp פנימי ב-FxRack |

## 5. מודל מצב UI ותלויות נתונים

`store.ts` מקבל slice חדש: `fx: [FxState, FxState]` עם `patchFx(rack, partial)`, אותו
דפוס בדיוק כמו `mixer.channels`. `FxStrip` קורא ממנו בלבד (לא נוגע ב-`engine` ישירות,
כמו כל קומפוננטת UI אחרת בקודבייס). `reverbAvailable` **לא** ב-store (זה עובדה על
ה-engine instance, לא state שניתן לשנות מבחוץ) — `FxStrip` קורא אותו ישירות מ-
`engine.fx[rack].reverbAvailable` פעם אחת ב-mount, כמו ש-`scratchAvailable` כבר נקרא היום.

## 6. בדיקות — השכבה הזולה ביותר, כולל רגרסיה מפורשת

### 6.1 חדש, יחידה (`tests/core/fx.test.ts`)
ר' 3.2 — כולל את בדיקת הרגרסיה על `equalPowerMix` מול הקרוספיידר הקיים.

### 6.2 חדש, Playwright/Chromium (כמו v0.6.0 — אין חומרה אמיתית בקונטיינר)
**פיצ'ר חדש:**
- Delay 1/4 על דק ב-128 BPM → `DelayNode.delayTime.value` תואם `beatFractionToSeconds`
- FX מנותב לערוץ → נשמע גם ב-`cueGain`/`cueBus` (בדיקת level, לא רק "לא קרס")
- FX מנותב למאסטר → יושב לפני `masterPostFx` (בדיקת graph, לא רק שמיעה)
- רענון דפדפן עם FX דלוק → אפקט/wet-dry/זמן/on-off/ניתוב חוזרים זהים
- Reverb buffer generation מדומה-נכשל → UI מציג "לא זמין", שאר 3 האפקטים עובדים

**רגרסיה מפורשת (בקשת שלום — "לא לשבור מה שכבר עובד"):**
- **`ctl.setFilter` הקיים** (הידית הסטטית) ממשיך לשנות את `lpf`/`hpf` בדיוק כמו לפני —
  FX "Filter" (הסוויפ) לא נוגע ב-nodes האלה בכלל
- **דק בלי FX מנותב** נשמע זהה (level, לא רק "משהו יוצא") לפני/אחרי השינוי — `fxSeam`
  ב-bypass הוא באמת gain=1 שקוף
- **הסאמפלר ממשיך להישמע** אחרי הכנסת `masterPostFx` — `samplerBus→masterBus→
  masterPostFx→destination` שלם, לא נשבר באמצע
- **קרוספיידר, EQ, cue mix, multichannel/stereo-fold split** — כל ההתנהגות הקיימת
  ב-`engine.ts`/`Mixer.tsx` שלא נוגעים ב-FX נשארת זהה (smoke test מקיף, לא רק unit)
- **פרסיסטנס סאמפלר קיימת** (v0.6.0) ממשיכה לעבוד — `fx-idb` הוא storage נפרד
  (`soundgrid:fx:racks`), לא משותף עם `soundgrid:sampler:bank`

### 6.3 `npm run check` ירוק לפני כל קומיט — tsc + oxlint + depcruise + vitest, כולל
כל הבדיקות הקיימות (128+ שעברו לפני השינוי, לא רק החדשות).

## 7. סיכונים, נסיגה, לא-מטרות מכוונות

**סיכון עיקרי:** reconnect-based routing (3.8) הוא הלוגיקה הכי חדשה/מורכבת בפלאן הזה —
אין לה תקדים ישיר בקודבייס מלבד `wireOutput()` (שמטפל רק בהחלפת התקן פלט, לא בניתוב FX
דינמי). ממותן ע"י: (א) reconnect קורה רק על שינוי ניתוב, לא בזמן מיקס תכוף, (ב) בדיקת
רגרסיה מפורשת (6.2) על הדקים/סאמפלר, (ג) Playwright בודק graph state ישירות, לא רק שמיעה.

**נסיגה:** כל שינוי הוא תוספתי — `masterPostFx`/`fxSeam` הם nodes חדשים בשרשרת קיימת, לא
שכתוב שלה. Revert = מחיקת ה-commit(ים) הרלוונטיים; אין מיגרציית נתונים הפיכה (ה-`fx-idb`
store חדש ונפרד, מחיקתו לא פוגעת בשום דבר אחר).

**לא-מטרות (מ-`FEATURE_SPEC.md`, לא נפתחות מחדש כאן):** Bit Crusher, Roll, Flanger,
Phaser, ניתוב Send, MIDI Learn גנרי — כולם `v0.7.1`/`v0.11.0`.

## 8. סדר יישום, עם אימות אחרי כל צעד

1. **`core/fx.ts` + `tests/core/fx.test.ts`** — `npm test` ירוק, כולל בדיקת הרגרסיה על
   `equalPowerMix`. שום קוד אחר לא זז עדיין.
2. **`engine.ts`'s `setCrossfader` קורא ל-`equalPowerMix`** — שינוי בן שורה אחת. אימות:
   קרוספיידר בדפדפן מתנהג זהה (A only / B only / אמצע) לפני commit.
3. **`mapping.ts` + `flx4-labels.ts` + `hints.ts`** — תוספות טיפוסים/מפות בלבד, בלי חיווט
   בפועל עדיין. אימות: `tsc -b` ירוק, `tests/core/hints.test.ts` עדיין ירוק (אין binding
   חדש ל-flx4.ts עדיין, אז אין דרישה חדשה).
4. **`fx.ts` (FxRack) — Delay בלבד קודם**, שאר 3 האפקטים כ-stub שזורק. אימות: Playwright,
   Delay 1/4 על דק ב-128 BPM, `delayTime` נכון.
5. **`deck.ts`'s `fxSeam` + `engine.ts`'s `masterPostFx`/`fx`/`setFxRouting`** — עדיין בלי
   UI/MIDI. אימות: **בדיקת רגרסיה קודם** (דק בלי FX = זהה להיום, סאמפלר עדיין נשמע), *אז*
   רק Delay מנותב ידנית (דרך console/טסט) לערוץ ולמאסטר, cue שומע נכון.
6. **`controls.ts`'s 5 הפונקציות + `store.ts`'s `fx` slice** — Delay נגיש מקוד היישום.
   אימות: אותה בדיקת Delay, הפעם דרך `ctl.setFxEffect` לא ישירות על ה-engine.
7. **`Mixer.tsx`'s `FxStrip`** — Delay נגיש מה-UI. אימות בדפדפן: לחיצות עכבר, hint mode
   מציג טקסט, הרצועה נכנסת בפועל ב-710px (מדידת DOM, לא ניחוש).
8. **Echo, Reverb, Filter** — אחד-אחד, כל אחד עם בדיקת Playwright ייעודית (Reverb כולל
   מסלול הכשל).
9. **`fx-idb/store.ts` + פרסיסטנס ב-`controls.ts`** — אימות: רענון דפדפן, כל 4 השדות חוזרים.
10. **`flx4.ts` + `manager.ts`'s dispatch** — חיווט FLX4 קבוע, מסומן לא-מאומת.
11. **`HANDOFF.md`** — סעיף חוב חדש: "10 בינדינגי FX על FLX4 לא מאומתים על חומרה", עקבי
    עם איך v0.5.0 תועד.
12. **`npm run check` מלא + סבב שימוש אמיתי בדפדפן** (שני הדקים, FX ביחד עם הסאמפלר, SYNC
    פעיל) לפני סגירת הגרסה — לא רק תרחיש בודד, בדיוק ההערה של שלום.

לאחר אישור התוכנית הזו, הצעדים הופכים למשימות בפועל (task list) — צעד אחד "בעבודה" בכל
רגע, אימות כמשימה נפרדת ומפורשת, לא "בערך נבדק".
