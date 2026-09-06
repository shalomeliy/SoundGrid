# PLAN — v0.5.0: Pad Modes

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר 06/09, ר' ההערה שם על העדר שלום
בצ'אט החי). כל ההחלטות המוצריות כבר נסגרו שם — התוכנית הזו היא רק "איך".

## 1. ארכיטקטורה נוכחית וזרימת הנתונים הרלוונטית

**נתיב עכבר** (`PadGrid.tsx:31-128`): רשת 4×2 קבועה. `onClick` קורא ישירות ל-`ctl.pressHotCue`/
`ctl.deleteHotCue`; גרירה קוראת ל-`ctl.moveHotCue`. Shift נקרא מקומית מה-DOM event
(`e.shiftKey`, שורה 67) — אין `shiftHeld` ב-store היום.

**נתיב MIDI** (`manager.ts:77-99` → `dispatch` שורות 101-202): `handle()` מפרסר בייטים גולמיים,
מוצא `Binding` לפי `bindingKey`, קורא ל-`dispatch`. `case 'hotcue'` (שורה 147-149) קורא
ל-`ctl.pressHotCue(deck, b.param)` — **רק על value>0, לא בודק release בכלל**. `case 'cue'`
(107-116) הוא הדוגמה הקיימת לדפוס press/release: `cueHeld` (Map, שורה 31) שומר את הclosure
שמחזיר `ctl.cuePlayPreview`, וקורא לו ב-release. זה בדיוק הדפוס ש-Loop Roll צריך.

**Choke point** (`controls.ts`): `pressHotCue`/`setHotCue`/`deleteHotCue`/`moveHotCue`
(690-772), `toggleLoop`/`setLoopBeats` (795-823), `quantizeIfOn` (899-912, private).
כולם קוראים ישירות ל-`engine.decks[id]` ול-`useStore`.

**נתיב עכבר, hold-then-release** (`Deck.tsx:259-267`, כפתור Cue): `onPointerDown` קורא
ל-`ctl.cuePlayPreview` ומקבל closure, רושם `window.addEventListener('pointerup', up)` —
לא `onPointerUp` על הכפתור עצמו, כי גרירה מחוץ לכפתור לא תפספס את השחרור. זה הדפוס
ל-Loop Roll ב-UI.

**טיפוסים** (`core/types.ts:67-108`): `DeckState` — אין `padMode`. `store.ts` — `emptyDeck`
(שורות 18-41) בונה ברירת מחדל; אין `shiftHeld` ברמת ה-store הראשי.

**מיפוי** (`core/mapping/mapping.ts:5-28`): `ControlAction` union — אין `'padMode'`/`'shift'`.
`flx4.ts:42-48` — 8 note-ים קבועים ל-hot cue, ללא בינדינג ל-mode-select/SHIFT.

**Hint mode** (`core/hints.ts`, `core/mapping/flx4-labels.ts`): `tests/core/hints.test.ts`
אוכף שכל `ControlAction` שנקשר ב-`FLX4_MAPPING` חייב שורה ב-`FLX4_LABELS`, ולהפך — **כל
`ControlAction` חדש שנקשר ב-flx4.ts חייב שורה מתאימה ב-flx4-labels.ts, אחרת `npm test` נכשל.**

## 2. הפרוסה הדקה מקצה-לקצה

Hot Cue נשאר קוד קיים, ללא נגיעה. Loop/Beat Jump/Sampler-stub הם 3 גופי-רשת חדשים תחת
מתג מצב אחד. SHIFT הוא flag גלובלי אחד שנקרא בשתי נקודות בלבד: בתוך `controls.ts`'s
`pressPad`, ובשכבת ה-UI (טבעת + תוויות). `manager.ts` לא לומד שום דבר חדש על "מה המצב עושה" —
הוא ממשיך להיות מתרגם בייטים→קריאה, בדיוק כמו היום.

## 3. קבצים לשינוי/הוספה, ותפקיד כל שינוי

### `src/core/types.ts`
- `PadMode = 'hotcue' | 'loop' | 'beatJump' | 'sampler'` (טיפוס חדש, מיוצא).
- `DeckState.padMode: PadMode` — שדה חדש.
- **לא** `shiftHeld` כאן — זה גלובלי, לא per-deck (ר' סעיף 4).

### `src/app/state/store.ts`
- `emptyDeck(...)`: `padMode: 'hotcue'` בברירת המחדל.
- state ראשי: `shiftHeld: boolean` (ברירת מחדל `false`) + `setShiftHeld(v: boolean)` פעולה,
  באותה צורה כמו `quantize`/`toggleQuantize` הקיימים (`store.ts`, בדוק שם מדויק של הפעולה
  המקבילה ל-quantize toggle כדי לשמור על אותה מוסכמת שמות).

### `src/core/padmodes.ts` (חדש)
לוגיקה טהורה בלבד, בדיוק כמו `core/hotcues.ts`/`core/beatgrid.ts` — אין import של React/
store/engine.

```ts
export const LOOP_BEATS_STEPS = [1/2, 1, 2, 4, 8, 16, 32, 64] as const // 8 ערכים, פד לכל אחד

export function beatJumpTargetSec(
  positionSec: number, bpm: number, beats: number, direction: 1 | -1, durationSec: number,
): number {
  const target = positionSec + direction * beats * (60 / bpm)
  return Math.max(0, Math.min(durationSec, target))
}

/**
 * שחרור Loop Roll: לאן הטראק "קופץ" כדי להדביק את המקום שהיה אמור להיות בו לו לא היה
 * מלולף. `elapsedSec` הוא הזמן האמיתי (audio-context, לא wall-clock) שחלף מאז הלחיצה,
 * `entrySec` המיקום בטראק ברגע הלחיצה.
 */
export function loopRollReturnSec(entrySec: number, elapsedSec: number, durationSec: number): number {
  return Math.max(0, Math.min(durationSec, entrySec + elapsedSec))
}
```

**הערה על tempo:** `elapsedSec` שמועבר פנימה כבר צריך לשקף את קצב הניגון בפועל (tempo
fader) — זה מחושב ב-`controls.ts` (`elapsedRealSec * playbackRate`), לא בתוך `padmodes.ts`
עצמו, כי `padmodes.ts` לא מכיר tempo/deck בכלל. `controls.ts` מעביר כבר את המספר הנכון.

### `tests/core/padmodes.test.ts` (חדש)
- `beatJumpTargetSec`: קדימה/אחורה, הצמדה ל-0 ול-duration, bpm שונים.
- `loopRollReturnSec`: elapsed=0 (חוזר למקום הלחיצה), elapsed שגורם לחרוג מ-duration (נצמד).

### `src/controls.ts`
פונקציות choke-point חדשות, ליד `toggleLoop`/`setLoopBeats` הקיימים:

- `setPadMode(deckId: DeckId, mode: PadMode)`:
  - אם `decks[deckId].padMode` הנוכחי הוא `'loop'` וגם `loopActive` וגם `mode !== 'loop'`:
    `deck.clearLoop()`, `patchDeck(deckId, { loopActive: false })`,
    `setNotice({ text: 'Loop stopped — switched away from Loop mode', tone: 'warn', source: 'padMode' })`.
  - אם Loop Roll באמצע החזקה על הדק הזה (ר' `loopRollState` למטה) — לשחרר אותו קודם
    (קורא לאותה פונקציית שחרור כמו `releasePad`, לא כותב לוגיקה כפולה).
  - `patchDeck(deckId, { padMode: mode })`.
- `pressPad(deckId: DeckId, index: number): () => void` — **תמיד מחזיר closure**, גם אם
  ריק (`() => {}`), כדי ש-`manager.ts` ו-UI יוכלו להתייחס לזה אחיד (כמו `cuePlayPreview`):
  - `mode === 'hotcue'`: `pressHotCue(deckId, index)` הקיים ללא שינוי, מחזיר `() => {}`.
  - `mode === 'loop'`, לא-shift: קריאה ל-loop toggle עם אורך `LOOP_BEATS_STEPS[index]`
    (התנהגות: אם `loopActive` וה-loop הנוכחי כבר באותו אורך → `clearLoop`+`loopActive:false`;
    אחרת → `setLoop(start, start+beatSec*n)` עם `start = quantizeIfOn(...)`, `loopActive:true`,
    `loopBeats: n`). מחזיר `() => {}`.
  - `mode === 'loop'`, shift מוחזק: Loop Roll. שומר ב-module-level map (לא ב-store —
    transient, כמו `activeTransition`): `loopRollState.set(deckId, { entrySec, startedAtSec:
    engine.currentTime, padIndex: index })`, קורא `deck.setLoop(entrySec, entrySec+beatSec*n)`.
    מחזיר closure ש: מחשב `elapsedSec = (engine.currentTime - startedAtSec) * playbackRate`,
    `deck.clearLoop()`, `deck.seek(loopRollReturnSec(entrySec, elapsedSec, duration))`,
    מוחק מה-map, ומעדכן `positionSec` ב-store.
  - `mode === 'beatJump'`: `beatJumpTargetSec` עם `direction = shiftHeld ? -1 : 1`,
    `beats = LOOP_BEATS_STEPS[index]`. אין grid → מתנהג כמו `quantizeIfOn`'s no-grid
    branch: משתמש ב-`bpm` הרגיל (לא ה-grid) אם קיים, אחרת `setNotice` "no tempo yet"
    ולא זז (guard זהה ל-`syncDeck`'s "no tempo" branch). מחזיר `() => {}`.
  - `mode === 'sampler'`: `setNotice({ text: 'Sampler isn't built yet — coming in v0.6.0',
    tone: 'warn', source: 'padMode' })`. מחזיר `() => {}`.
  - שומר guard `if (!deck.hasTrack) return () => {}` בתחילת הפונקציה, עקבי עם כל שאר
    `controls.ts`.
- `setShiftHeld(down: boolean)`: `useStore.setState({ shiftHeld: down })` בלבד. פשוט
  בכוונה — כל הלוגיקה שקוראת את `shiftHeld` נמצאת ב-`pressPad` עצמו, לא כאן.

`shiftHeld` נקרא בתוך `pressPad` דרך `useStore.getState().shiftHeld` (לא פרמטר) — כך גם
ה-UI (`onMouseDown`) וגם ה-MIDI dispatch קוראים לאותה `pressPad(deckId, index)` בלי צורך
להעביר shift בעצמם; המקור האמיתי היחיד הוא ה-store.

### `src/core/mapping/mapping.ts`
- `ControlAction` union: מוסיף `'padMode'` ו-`'shift'`.
- `Binding.param` ל-`'padMode'`: אינדקס המצב (0=hotcue,1=loop,2=beatJump,3=sampler) —
  אותו דפוס בדיוק כמו `param` ל-`'hotcue'`.

### `src/platform/transport-webmidi/manager.ts`
- `padHeld = new Map<string, () => void>()` (שדה חדש על המחלקה, ליד `cueHeld`).
- `case 'hotcue'` (שורה 147-149) משתנה ל:
  ```ts
  case 'hotcue': {
    if (!deck || b.param == null) break
    const key = `${deck}:${b.param}`
    if (value > 0) {
      this.padHeld.set(key, ctl.pressPad(deck, b.param))
    } else {
      this.padHeld.get(key)?.()
      this.padHeld.delete(key)
    }
    break
  }
  ```
  **חשוב:** שם ה-wire action נשאר `'hotcue'` — לא משנים אותו ל-`'padPress'` או דומה, כי
  זה בדיוק ה-key שנשמר ב-Learn מיפויים קיימים של המשתמש (`idb-keyval`, `CUSTOM_KEY`).
  שינוי השם היה שובר בשקט כל מיפוי מותאם-אישית קיים — בדיוק הסיכון שהארכיטקטורה הזהירה
  ממנו.
- `case 'padMode'` חדש: `if (value > 0 && deck && b.param != null) ctl.setPadMode(deck,
  PAD_MODES[b.param])` — טבלת `PAD_MODES` קבועה (`['hotcue','loop','beatJump','sampler']`)
  ב-`manager.ts` עצמו (סטטית, לא לוגיקה עסקית — תרגום מספר לאינדקס, אותה רמה כמו
  `bipolar`/`unipolar` שכבר קיימים בקובץ).
- `case 'shift'` חדש: `ctl.setShiftHeld(value > 0)`.
- **בלי שום `if (deck.padMode === ...)` בתוך `manager.ts`** — זה בדיוק העומק הנוסף
  שהארכיטקטורה הזהירה ממנו לגבי הפרת הגבול המתועדת של הקובץ הזה.

### `src/platform/transport-webmidi/mappings/flx4.ts`
- 4 בינדינגים חדשים ל-4 כפתורי בחירת מצב (note, ליד ה-transport/loop הקיימים בפונקציית
  `deck(ch)`), מסומנים best-effort **בדיוק** כמו כל שאר ניחוש בקובץ (הערת "לתקן ע"י Learn").
  `param` = אינדקס לפי `PAD_MODES` ב-`manager.ts` (0/1/2/3).
- בינדינג אחד ל-SHIFT — **גלובלי, לא per-channel** (כפתור פיזי יחיד): שים ב-`bindings`
  הראשי (יחד עם ה-mixer/browse), לא בתוך `deck(ch)`.
- מספרי note מדויקים: ניחוש סביר (לדוגמה טווח 0x1b-0x1e ל-4 כפתורי המצב על סמך פריסת
  FLX4 המתועדת, 0x3f ל-SHIFT) — **לא מאומת על חומרה אמיתית**, בדיוק כמו רוב שאר הקובץ
  לפני 30/08. שלום מתקן דרך Learn אם שגוי.

### `src/core/mapping/flx4-labels.ts`
- הוספת שורות ל-`FLX4_LABELS` בשביל `'padMode'` ו-`'shift'` — **חובה**, אחרת
  `tests/core/hints.test.ts`'s "has an FLX4_LABELS entry for every action the real mapping
  binds" נכשל ברגע ש-`flx4.ts` מקשר את הפעולות האלה.

### `src/core/hints.ts`
- `deck.padGrid` הקיים: לעדכן את הטקסט כך שיתאר את הרשת הכללית + שהתנהגות תלוית-מצב,
  לא רק Hot Cue (הימנעות מ"תיעוד שהופך לשקר" — אותו עיקרון שה-doc-map section עצמו דורש).
- הוספת `deck.padMode` חדש (action: `'padMode'`) ל-שורת בחירת המצב.
- הוספת `deck.shift` חדש (action: `'shift'`).

### `src/app/components/PadGrid.tsx`
פיצול לרכיב מארח + 4 גופי-רשת:
- שורת הכותרת (34-44) הופכת לשורת 4 `Button variant="toggle" size="sm"` (`CUE/LOOP/JUMP/
  SMPL`), `active` = `padMode === mode`, `tone={color}` (color מועבר כ-prop חדש מ-`Deck.tsx`,
  אותו `color` שכבר קיים שם), `onClick={() => ctl.setPadMode(deckId, mode)}`.
  `HintIcon id="deck.padMode"` צמוד לשורה, כמו היום.
- טבעת SHIFT: `className` על מיכל הרשת החיצוני, מותנה ב-`shiftHeld` (מ-store, `useStore`),
  `boxShadow` בסגנון `--color-accent`, אותה טכניקה כמו ה-drop-target ring ב-`Deck.tsx:110-130`.
  + `Pill tone="warn" label="SHIFT"` קטן ליד שורת המצבים כשמוחזק (לא צבע-בלבד).
- גוף הרשת הנוכחי (46-125) עובר בלי שינוי ללוגי לרכיב `HotCuePads` (מוצג כש-`padMode ===
  'hotcue'`).
- `LoopPads` (חדש): 8 פדים, תווית = `LOOP_BEATS_STEPS[i]` (או "×N"), `onMouseDown` קורא
  ל-`ctl.pressPad(deckId, i)` ושומר את ה-closure, `window.addEventListener('pointerup', ...)`
  לשחרור — אותו דפוס בדיוק כמו `Deck.tsx:259-267`. תווית מתחלפת ל"←N" כש-`shiftHeld`.
- `BeatJumpPads` (חדש): אותה תבנית ויזואלית, `onClick` פשוט (לא hold) קורא `ctl.pressPad`
  ומתעלם מה-closure (`beatJump` תמיד מחזיר `() => {}`). תווית "→N"/"←N" לפי shift.
- `SamplerPadsStub` (חדש): 8 פדים אפורים קבועים, `onClick` קורא `ctl.pressPad` (שמראה
  את הודעת "עוד לא בנוי").
- כל 4 הרכיבים חולקים קלאסים/מבנה (`grid grid-cols-4 gap-1`, `h-10`) — לא לשכפל CSS,
  לחלץ קבועי סטייל משותפים אם משתכפל יותר משתי פעמים.

### `src/app/components/Deck.tsx`
- שורה 346: `<PadGrid deckId={deckId} hotCues={deck.hotCues} padMode={deck.padMode}
  color={color} />` — מעביר `padMode`+`color` (כבר קיים כמשתנה מקומי ב-Deck.tsx לצביעת
  שאר הכפתורים, `tone={color}` בכל מקום אחר בקובץ).

## 4. שינויי API/טיפוסים, כולל התנהגות כשל

| שינוי | כשל אפשרי | טיפול |
|---|---|---|
| `PadMode` חדש | ערך לא חוקי מגיע מ-persisted state ישן | לא persisted (ר' spec), אין נתיב לערך לא חוקי |
| `shiftHeld: boolean` גלובלי | keyup לא מגיע (blur) | `onBlur` ב-`App.tsx` (כמו bend keys) קורא `ctl.setShiftHeld(false)` |
| `pressPad` מחזיר closure | קריאה כפולה ל-release | closure idempotent (no-op בפעם השנייה — `loopRollState.delete` כבר לא קיים) |
| `case 'padMode'`/`'shift'` ב-dispatch | note לא מאומת (ניחוש שגוי) | שום דבר לא קורה בלחיצה — מתועד כ"לתקן ע"י Learn", לא קורס |
| Beat Jump בלי bpm | קפיצה לא מוגדרת | `setNotice` "no tempo yet", לא זז, לא קורס |

## 5. מודל state של ה-UI ותלויות נתונים

```
DeckState.padMode          — per-deck, לא persisted, ברירת מחדל 'hotcue'
AppState.shiftHeld         — גלובלי, לא persisted, ברירת מחדל false
controls.ts (module-level) — loopRollState: Map<DeckId, {entrySec, startedAtSec, padIndex}>
                              (transient, כמו activeTransition — לא ב-store כי לא serializable-ראוי
                              ולא צריך React re-render על כל שינוי שלו)
manager.ts (instance)      — padHeld: Map<string, () => void> (כמו cueHeld)
```

תלות חדשה אחת בין UI לבין store: `PadGrid.tsx` קורא `useStore((s) => s.shiftHeld)` בעצמו
(לא מקבל כ-prop) — כי הטבעת חייבת להגיב מיידית ל-MIDI/מקלדת בלי ש-`Deck.tsx` יצטרך
להעביר את זה ידנית דרך כל הפרופס.

## 6. בדיקות בשכבה הזולה ביותר

- `tests/core/padmodes.test.ts` — vitest אמיתי, בלי mock, על `beatJumpTargetSec`/
  `loopRollReturnSec` הטהורות. זה כל מה ש-CLAUDE.md דורש "ללא תירוץ" (לוגיקה טהורה).
- `tests/core/hints.test.ts` הקיים — ירוץ אוטומטית נגד `flx4-labels.ts`/`flx4.ts`
  המעודכנים; חייב לעבור בלי שינוי בקובץ הבדיקה עצמו.
- **בדפדפן** (`npm run dev` ברקע + Playwright/Chromium בסביבה המרוחקת הזו — אין
  `preview_start` פה): טעינת טראק, מעבר בין 4 מצבים (בדיקת `javascript_tool` שרשת
  הפדים באמת מציגה תוכן שונה), הפעלת Loop ומעבר מצב (בדיקת notice + `loopActive`
  חוזר ל-false), Beat Jump ליד קצוות, Shift מוחזק (מקלדת) עם טבעת+תוויות. אין FLX4
  אמיתי בסביבה הזו — מיפוי החומרה עצמו לא ניתן לאימות כאן, רק מבנה הקוד.

## 7. סיכונים, נסיגה, ולא-מטרות מכוונות

- **סיכון:** ניחוש note שגוי ל-4 כפתורי המצב/SHIFT (אין חומרה כאן לבדוק). **מיטיגציה:**
  מתועד באותה מוסכמה כמו כל שאר `flx4.ts`, מתוקן ע"י Learn — לא חוסם merge.
  **נסיגה:** מחיקת 4 השורות מ-`flx4.ts` בלבד, כלום אחר לא תלוי בהן.
- **סיכון:** Loop Roll שנשאר תקוע (note-off אבד). **מיטיגציה:** `setPadMode` בודק ומשחרר
  לפני מעבר מצב; `onBlur` ב-App.tsx (אם מקלדת); אין מיטיגציה ל-MIDI note-off אבוד עצמו
  (בעיה כללית קיימת כבר ב-`cueHeld`/`syncDownAt` — לא בתכולת הגרסה הזו לפתור).
- **לא-מטרה מכוונת:** Sampler אמיתי — stub בלבד (ר' spec).
- **נסיגה כללית:** `padMode` ברירת מחדל `'hotcue'` והתנהגות Hot Cue לא זזה בקוד קיים —
  אם מצב כלשהו מתנהג רע על החומרה, אפשר להחזיר את `PadGrid.tsx`/`controls.ts` לגרסה
  קודמת בלי לגעת ב-`pressHotCue`/`setHotCue`/`moveHotCue`/`deleteHotCue` כלל.

## 8. סדר ביצוע עם אימות אחרי כל צעד משמעותי

1. **`core/types.ts` + `store.ts`**: הוספת `PadMode`/`padMode`/`shiftHeld`. אימות: `tsc -b`
   ירוק (אין עדיין שימוש, אז אין שגיאות type משמעותיות).
2. **`core/padmodes.ts` + `tests/core/padmodes.test.ts`**: לוגיקה טהורה + בדיקות. אימות:
   `npm test` ירוק על הקובץ הזה בלבד.
3. **`controls.ts`**: `setPadMode`/`pressPad`/`setShiftHeld`. אימות: `tsc -b` ירוק,
   אין עדיין קורא בפועל (מבודד).
4. **`core/mapping/mapping.ts`**: `ControlAction` מתרחב. אימות: `tsc -b` — כל מקום שממצה
   `ControlAction` ב-switch (יש רק אחד: `manager.ts`) יסמן חוסר `case` אם TS strict
   דורש exhaustiveness (לבדוק אם יש `never` check בסוף ה-switch; אם לא, זה לא ייכשל
   אוטומטית — לוודא ידנית בצעד הבא).
5. **`manager.ts`**: `case 'padMode'`/`'shift'`, שינוי `case 'hotcue'` ל-press/release
   עם `padHeld`. אימות: `npm run check` מלא (tsc+oxlint+depcruise+vitest) — במיוחד
   `depcruise` שה"warn" הקיים על הקובץ הזה לא הפך ל-`error` חדש.
6. **`flx4.ts` + `flx4-labels.ts` + `hints.ts`**: בינדינגים חדשים + תוויות. אימות:
   `npm test` — `tests/core/hints.test.ts` **חייב** לעבור (הבדיקה שתלויה בסנכרון בין
   שני הקבצים).
7. **`PadGrid.tsx` + `Deck.tsx`**: ה-UI המלא — שורת מצבים, 4 גופי-רשת, טבעת SHIFT.
   אימות: בדפדפן (`npm run dev` + Playwright בסביבה המרוחקת) — כל קריטריון קבלה
   מה-spec, אחד־אחד.
8. **`App.tsx`**: מאזין מקלדת ל-`ShiftLeft`/`ShiftRight` (keydown/keyup + blur-release,
   אותו דפוס כמו bend keys) שקורא ל-`ctl.setShiftHeld`. אימות: בדפדפן — Shift מוחזק
   מראה טבעת, blur בזמן החזקה משחרר (בדיקה עם `window.dispatchEvent(new Event('blur'))`
   דרך `javascript_tool` אם צריך).
9. **`npm run check` מלא** + עדכון `HANDOFF.md`/`ROADMAP.md` + `python
   scripts/context_check.py` + commit + push, בדיוק לפי הנוהל ב-CLAUDE.md.
