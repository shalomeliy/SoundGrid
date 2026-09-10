# PLAN — v0.7.5: הקלטה (סאמפלר + מאסטר), מאוחדת

מבוסס על `workshop-output/FEATURE_SPEC.md` (מאושר 09/10). ה-spec כבר סגר את כל ההחלטות
המוצריות — התוכנית הזו היא רק "איך", קובץ-אחרי-קובץ, מבוססת על קריאה מלאה של הקוד הקיים
(`engine.ts`, `scratch-processor.ts`, `sampler.ts`, `core/sampler.ts`, `sampler-idb/store.ts`,
`controls.ts` — חלקי הסאמפלר, `store.ts`, `TopBar.tsx`, `PadGrid.tsx`, `core/ports/audio.ts`).
**מחליפה** את התוכן הישן שהיה כאן (`PLAN.md` של v0.7.0).

## סטייה אחת מהמלצת סקירת הארכיטקטורה, שדורשת ציון

סקירת ה-architecture-expert הציעה `core/ports/recorder.ts` חדש (ממשק `AudioTap` מופשט). קריאת
הקוד הקיים מגלה שזה **לא** התבנית שהפרויקט בפועל משתמש בה: `core/ports/audio.ts`'s
`AudioBackend`/`DeckBackend` קיימים אבל **לא בשימוש בפועל** — `controls.ts` מייבא את ה-singleton
הקונקרטי `engine` ישירות (`from '@/platform/audio-webaudio/engine'`), לא דרך הפורט. גם FX (v0.7.0)
וגם הסאמפלר (v0.6.0) לא הוסיפו פורט משלהם — הם פשוט הוסיפו מחלקה/מתודות ל-`AudioEngine`/מחלקה
אחותה, וקראו להן ישירות מ-`controls.ts`. פורט ב-`core/` נחוץ רק כש**קוד ב-`core/` עצמו** צריך
לתלות בהפשטה על משהו ב-`platform/` — וזה לא המקרה כאן: הלוגיקה הטהורה (`core/wav.ts`,
`core/recording.ts`) לא קוראת ל-audio tap בכלל, היא רק מקבלת/מחזירה מספרים ו-bytes. **מחליט:
לא בונים פורט חדש** — עוקבים אחרי התבנית הקיימת (FX/Sampler) ולא אחרי מה שכתוב ב-`core/ports/audio.ts`
שכבר מיושן ביחס לקוד בפועל. זו החלטת "איך" שלא משנה שום דבר מוצרי מה-spec.

## 1. ארכיטקטורה נוכחית וזרימת נתונים רלוונטית

```
Deck A ──┐                                    masterBus ──(rebuildMasterChain,
Deck B ──┼─→ masterBus ──[FX chain 0/1?]──→ masterPostFx ──┬──(wireOutput)──→ destination
samplerBus┘                                                 └── **v0.7.5 tap point** (חדש)

masterPostFx: GainNode קיים מ-v0.7.0 (engine.ts:39), התחנה היציבה שה-FX תמיד יושב
לפניה — בדיוק הסיבה שהיא נבחרה מראש כ-tap של ההקלטה (התיעוד בקוד כבר אומר את זה במפורש).
```

זרימת סלוט סאמפלר קיימת (v0.6.0): `loadSamplerSlotAudio` (controls.ts) מפענח קובץ →
`engine.sampler.loadSlot(index, buffer)` (זיכרון בלבד) + `contentHash` נשמר במטא-דאטה
(`sampler-idb/store.ts`, `saveSamplerBank`) — **אין שום בייטים של אודיו נשמרים ב-IndexedDB
היום**. שחזור בעליית מערכת קורא רק מטא-דאטה (`restoreSamplerBankMeta`) ואז מפענח מחדש מתוך
קובץ הספרייה שתואם ל-`contentHash` (`resolveSamplerSlots`). **זו הבעיה שהספק כבר סימן:**
הקלטה חיה אין לה קובץ מקור ואין לה `contentHash` לשחזר ממנו — צריך מסלול אחסון חדש.

## 2. הפרוסה הדקה מקצה-לקצה (thin slice)

הפרוסה הראשונה שמוכיחה את כל המנגנון: להקליט 5 שניות מהמאסטר (עם דק מנגן), לעצור, ולשמוע את
זה חוזר משני מקומות — קובץ WAV שנפתח בנגן חיצוני, ופד סאמפלר שמנגן את אותו תוכן ושורד רענון
דף. שאר הפיצ'ר (חיתוך לפי טראק, cue sheet, מונה זמן/גודל חי, מצב "לא נשמר") נבנה מעל הפרוסה
הזו, לא לפניה.

## 3. קבצים מדויקים לשינוי/הוספה ותפקיד כל שינוי

**חדש, טהור (`core/`) — מקבל בדיקות יחידה אמיתיות:**

- **`src/core/wav.ts`** — פורמט WAV בלבד. `interleave(channels: Float32Array[]): Float32Array`,
  `floatTo16BitPCM(samples: Float32Array): Int16Array`, `buildWavHeader(dataBytesLen, sampleRate,
  numChannels, bitsPerSample): Uint8Array`, `encodeWav(channels: Float32Array[], sampleRate:
  number): Uint8Array` (header+data מוכן ל-Blob). אין `AudioContext`, אין DOM.
- **`src/core/recording.ts`** — קבועים ומתמטיקה טהורה: `MASTER_RECORDING_MAX_SEC` (תקרה,
  שלום אישר 2-3 שעות — קבוע כיול, **לא** מגיע ל-Settings, אותו כלל כמו `PLATTER_SIZE` וחבריו),
  `SAMPLER_CAPTURE_MAX_SEC` (תקרה קצרה יותר, ~5 דקות — סלוט סאמפלר לא אמור להיות הקלטת מאסטר
  שנייה), `estimateBytesRemaining(bytesRecorded, sampleRate, channels)`,
  `splitByTrackBoundaries(totalFrames, boundariesSec, sampleRate): { startFrame, endFrame }[]`
  (לוגיקת החיתוך לקבצים, טהורה — לא נוגעת בקבצים בפועל).

**חדש, פלטפורמה (`platform/audio-webaudio/`):**

- **`src/platform/audio-webaudio/recorder-processor.ts`** (AudioWorklet חדש) — אותה תבנית
  בדיוק כמו `scratch-processor.ts`: קובץ שאסור לו לייבא כלום. קורא `inputs[0]` כל render
  quantum (128 frames), צובר ל-buffer פנימי, ושולח `{type:'chunk', channels: Float32Array[]}`
  דרך `port.postMessage` עם transfer בכל ~4096 frames (כדי לא להציף בהודעות ב-344/שנייה) —
  אותו קצב אנכור בערך כמו `ANCHOR_EVERY_QUANTA` הקיים. הודעת `flush` שולחת מה שנשאר בעצירה.
- **`src/platform/audio-webaudio/recorder-tap.ts`** — מחלקה קטנה: בונה `AudioWorkletNode`
  אחד (`ensureRecorderEngine()` על ה-`AudioEngine`, אותו דפוס addModule+probe-node כמו
  `ensureScratchEngine`), מתחבר ל-`masterPostFx` **בענף** (`.connect()` בלבד — שום `.disconnect()`
  על מה שכבר מחובר, בדיוק הדרישה מה-spec ש"מת tap לא משפיע על המיקס החי"). חושף
  `onChunk(cb)`/`stop()`. תומך בכמה מופעים בו-זמנית (סלוט + מאסטר ביחד) כי כל אחד הוא
  `AudioWorkletNode` נפרד על אותו graph — לא state גלובלי משותף, בדיוק התיקון לממצא ה-QA
  על "שני הקלטות בו-זמנית".
- **`src/platform/audio-webaudio/engine.ts`** — הוספת `createMasterTap(): RecorderTap` ו-
  `ensureRecorderEngine(): Promise<boolean>` (אותו דפוס בדיוק כמו `ensureScratchEngine`,
  כולל `scratchError`-style שדה `recorderError` ל-UI כשה-worklet לא נטען — **לא סייל שקט**).
- **`src/platform/audio-webaudio/sampler.ts`** (`SamplerEngine`) — מתודה חדשה
  `buildBufferFromChunks(channels: Float32Array[][], sampleRate): AudioBuffer` (עוזר קטן,
  לא state) — משתמשת ב-`ctx.createBuffer` + `copyToChannel`, לא צריכה round-trip דרך WAV.

**חדש, אחסון (`platform/`):**

- **`src/platform/recorder-fsaccess/writer.ts`** — File System Access לכתיבת המאסטר. אותה
  תבנית בדיוק כמו `sampler-idb/store.ts`'s `exportSamplerBankToFile`: `showSaveFilePicker`/
  `showDirectoryPicker`, `AbortError` = `'cancelled'` (לא שגיאה), אחרת throw שה-`controls.ts`
  הופך להודעה. שתי פונקציות: `saveMasterRecording(bytes: Uint8Array, suggestedName): Promise<'ok'|'cancelled'>`
  (קובץ WAV יחיד — כשאין סימוני חיתוך), ו-`saveSplitMasterRecording(files: {name: string; bytes:
  Uint8Array}[], cueSheetText: string): Promise<'ok'|'cancelled'>` (`showDirectoryPicker`, כותב
  N קבצי WAV + קובץ cue-sheet טקסט אחד לתוך התיקייה שנבחרה).
- **`src/platform/sampler-recordings-idb/store.ts`** (חדש, קטן) — אחסון בייטים בפועל של הקלטת
  סלוט, כי `sampler-idb/store.ts` הקיים שומר מטא-דאטה בלבד (`contentHash`, לא bytes). `get/set/del`
  על `idb-keyval` תחת `soundgrid:sampler:recording:<id>`, ערך הוא `Blob` (WAV). **אף פעם לא
  throw בקריאה** — אותו כלל כמו `getSamplerBank`: רשומה חסרה/פגומה משאירה את הסלוט לא-פתור
  עם הודעה גלויה, לא ריק בשקט.

**שינוי, טהור (`core/`):**

- **`src/core/sampler.ts`** — `SamplerSlot` מקבל שדה חדש `recordingId: string | undefined`
  (מקביל ל-`contentHash`, בלעדי הדדית איתו: סלוט תפוס הוא **או** מקושר-ספרייה **או** מוקלט,
  לא שניהם). `emptySamplerSlot()` מוסיף `recordingId: undefined`.

**שינוי, אחסון מטא-דאטה:**

- **`src/platform/sampler-idb/store.ts`** — `StoredSamplerSlot` מקבל `recordingId:
  string | undefined` לצד `contentHash` הקיים (שניהם אופציונליים; בזמן ריצה בדיוק אחד מהם
  מוגדר לסלוט תפוס). `getSamplerBank`/`saveSamplerBank` לא משתנים במבנה — רק בשדה הנוסף.

**שינוי, choke point (`controls.ts`) — פונקציות חדשות, ללא `ControlAction`/dispatch:**

הכלל "פעולת משתמש חדשה → `ControlAction` + case ב-`dispatch` + `flx4.ts`" חל כשיש כוונה
אמיתית למפות כפתור פיזי. שלום סגר: **עכבר בלבד בשלב הזה** — אותה החלטה שv0.6.0 (עריכת סלוט)
וחלקי v0.7.0 כבר עשו, ושניהם **לא** קיבלו `ControlAction`/dispatch entry, רק פונקציות ב-
`controls.ts` שקוראות ל-UI ישירות (ר' `setSamplerSlotMode`/`clearSamplerSlot` — אין להן).
עוקבים אותה תבנית:

- `startSamplerCapture(index)` — guard: `slot.trackId == null && slot.recordingId == null`
  (סלוט ריק בלבד — לא דורס תפוס, per spec). `!engine.sampler.hasBuffer(index)` בפועל. אם אין
  סלוט פנוי כלשהו בבנק כולו — לא רלוונטי כאן (הבדיקה היא per-slot, לא global; ה-UI מציג
  "הקלט" רק על סלוטים ריקים ממילא, ר' סעיף 5).
- `stopSamplerCapture(index)` — אוסף chunks, `buildBufferFromChunks`, `engine.sampler.loadSlot`,
  מקודד ל-WAV (`core/wav.ts`), `saveRecordingBlob` (ה-store החדש), `patchSamplerSlot` עם
  `recordingId` חדש + `trackName: "Recording N"` (ממוספר לפי כמות הקלטות קיימות), `schedulePersistSamplerBank()`.
- `startRecordMaster()` / `stopRecordMaster()` — `createMasterTap`, אוסף chunks ל-buffer
  מודול-level (לא ב-store — "store holds serializable state only"), `patchRecording({active:
  'master', startedAt, bytesRecorded: 0})`; עצירה מעדכנת `patchRecording({active: null,
  savedState: 'unsaved'})` ומשאירה את ה-buffer בזיכרון.
- `markRecordingTrackBoundary()` — פעיל רק כש-`recording.active === 'master'`; דוחף
  `ctx.currentTime`-relative שנייה ל-`recording.trackBoundariesSec`.
- `saveRecordedMaster()` — אם `trackBoundariesSec.length === 0`: `encodeWav` + `saveMasterRecording`
  (קובץ יחיד). אחרת: `splitByTrackBoundaries` (core/recording.ts) → `saveSplitMasterRecording`
  (תיקייה + cue sheet). הצלחה → `patchRecording({savedState:'saved'})` ומנקה את ה-buffer;
  `'cancelled'` → `patchRecording` לא משתנה, ה-buffer נשאר. שגיאה אחרת → `setNotice` (tone
  `warn`, source `'recording'`), buffer נשאר.
- `discardRecordedMaster()` — מוחק את ה-buffer המודול-level, `patchRecording({active: null,
  savedState: 'idle', bytesRecorded: 0, trackBoundariesSec: []})`. דורש אישור לחיצה מפורש
  ב-UI (לא נקרא אוטומטית משום מקום).
- הרחבת `resolveSamplerSlots`/`restoreSamplerBankMeta` (הפונקציות הקיימות): סלוט עם
  `recordingId` (במקום `contentHash`) נפתר **מיד** ב-boot — `getRecordingBlob(id)` →
  `engine.decode()` → `loadSlot` — **לא תלוי בסריקת ספרייה** בכלל, בשונה מהמקרה הקיים.
  `unresolved` count הקיים ממשיך לספור רק כשלונות מקושרי-ספרייה; כשל בפתרון הקלטה מקבל הודעה
  נפרדת ("הקלטה בסלוט N לא נטענה — [סיבה]") כי זו קטגוריית כשל שונה (בייט חסר/פגום ב-IDB,
  לא "טראק לא נסרק עדיין").
- הרחבת `clearSamplerSlot` — אם ל-slot יש `recordingId`, גם `deleteRecordingBlob(id)` (מונע
  צבירת בייטים יתומים ב-IndexedDB).

**שינוי, state (`app/state/store.ts`):**

- `AppState.recording: { active: 'master' | null; startedAt: number | null; bytesRecorded:
  number; savedState: 'idle' | 'unsaved' | 'saved'; trackBoundariesSec: number[] }` — סטטוס
  בלבד, סריאלייזבילי; ה-PCM עצמו חי ב-module state של `controls.ts`. `patchRecording` action
  חדש, אותו דפוס כמו `patchFxRack`/`patchSamplerSlot`.
- `sampler.armedSlot: number | null` — איזה סלוט פתוח כרגע ל"הקלט" (ל-UI, `PadGrid.tsx` צריך
  לדעת אם הוא במצב "מוכן להקליט" מול "מקליט בפועל" מול "רגיל"). קטן מספיק שלא שווה מודול
  נפרד; שדה סריאלייזבילי כמו כל שאר ה-state.

**שינוי, UI (`app/components/`):**

- **`PadGrid.tsx`'s `SamplerSlotEditor`** — ה-branch הריק (שורה 554-556 היום) מקבל כפתור
  "הקלט" (טוען/מקליט/עוצר, לפי `armedSlot`/`recording per-slot state`). **`padClass` הראשי
  (שורה 464-480)** מקבל branch שלישי חדש לצד `dragOver`/`playing`/`occupied`/ריק: מצב
  "מקליט" מקבל טוקן ויזואלי שמור משלו — **לא** `--color-live` (כבר FX On + Sync) ולא
  `--color-accent` המלא (כבר "מנגן") — משתנה CSS חדש (למשל `--color-record`, אדום/כתום
  מובחן) עם pulse שמור *רק* למצב הזה, מכבד `prefers-reduced-motion` (טקסט "REC" סטטי כשה-
  media query דולק).
- **`TopBar.tsx`** — `RecordingBadge` חדש (אותו מיקום כמו `MidiBadge`, ליד ה-Pills הקיימים):
  `Pill` עם טון `live` בזמן הקלטה ("מקליט מאסטר · 12:34 · 84MB", ספירה חיה מ-`bytesRecorded`),
  טון `warn` **בלי timeout** כש-`savedState === 'unsaved'` ("לא נשמר — שמור או מחק · 12:34").
  כפתורי Start/Stop + "סמן טראק חדש" (האחרון רק כש-`active === 'master'`) + Save/Discard
  (רק כש-`savedState === 'unsaved'`).
- **`CLAUDE.md` / `CLAUDE-HE.md`** — תוספת תחת "Read the user's files; never write to them":
  משפט שמנסח את הסייג — הקלטה כותבת קובץ **חדש** שהמשתמש בוחר בדיאלוג, לא קובץ קיים שלו;
  הכלל read-only ל-`tags.ts`/לספרייה לא זז. **שני הקבצים באותו commit**, כמו תמיד.

## 4. שינויי API/טיפוסים, כולל התנהגות כשל

| שינוי | כשל, ואיך זה מגיע למשתמש |
| --- | --- |
| `ensureRecorderEngine()` | Worklet לא נטען/AudioWorklet לא קיים ← `recorderError` על ה-engine, Pill מציג "אין הקלטה · [סיבה]" (אותו דפוס כמו `scratchError`) — לא כפתור שקט שלא עושה כלום. |
| `saveMasterRecording`/`saveSplitMasterRecording` | `AbortError` → `'cancelled'`, buffer נשאר. שגיאת כתיבה אחרת → `throw`, `controls.ts` תופס ל-`setNotice(tone:'warn')`, buffer נשאר. |
| `getRecordingBlob` | חסר/פגום → `undefined`/throw נתפס, סלוט מקבל הודעה "לא נטען", לא נשאר ריק בלי הסבר. |
| תקרת `MASTER_RECORDING_MAX_SEC`/`SAMPLER_CAPTURE_MAX_SEC` | הגעה לתקרה עוצרת הקלטה **לבד** (כמו "זיכרון אזל" ב-spec), לא ממתינה ל-OOM אמיתי — named, לא תאונה. |
| `startSamplerCapture` על סלוט תפוס | no-op מוחלט, לא מוצג כפתור "הקלט" מלכתחילה על סלוט תפוס (ה-UI לא נותן ללחוץ, לא רק מתעלם בשקט מהלחיצה). |

## 5. מודל מצב UI ותלויות נתונים

```
sampler.armedSlot: number | null  →  PadGrid: איזה פד מציג "הקלט"/"עצור הקלטה"
recording.active: 'master' | null  →  TopBar: Start מול Stop
recording.savedState               →  TopBar: מוסתר / "מקליט..." / "לא נשמר — שמור/מחק"
recording.bytesRecorded/startedAt  →  TopBar: הטקסט החי של הזמן/גודל (מחושב, לא נשמר per-tick)
```

אין תלות הדדית בין שני מצבי ה-UI — הקלטת סלוט והקלטת מאסטר יכולות לרוץ בו-זמנית (שני
`RecorderTap` נפרדים על אותו `masterPostFx`, ר' סעיף 3).

## 6. בדיקות בשכבה הזולה ביותר

- **`tests/core/wav.test.ts`** (חדש) — `buildWavHeader` מול בייטים מחושבים ידנית (RIFF size,
  `fmt ` chunk, `data` chunk); `interleave`/`floatTo16BitPCM` מול מערכים קטנים ידועים;
  `encodeWav` round-trip (קידוד ואז פענוח ידני של ה-header חזרה למספרים).
- **`tests/core/recording.test.ts`** (חדש) — `estimateBytesRemaining` מול חשבון ידני;
  `splitByTrackBoundaries` על מקרי קצה: אין סימונים (קובץ אחד), סימון בודד, סימון בדיוק על
  frame 0/על הסוף, סימונים לא-ממוינים (אמור למיין).
- **בדיקת רגרסיה מפורשת** (שלום ביקש בפירוש ב-v0.7.0 אחרי הבאגים שיצאו מ-v0.6.0): להריץ מחדש
  את תרחיש v0.6.0/v0.7.0 המלא (Playwright/Chromium אמיתי) — שני דקים + SYNC + סאמפלר + FX —
  **עם** הקלטה דלוקה במקביל, לוודא ששום דבר קיים לא זז (במיוחד: `masterPostFx`'s connections
  הקיימות ל-`wireOutput`/`rebuildMasterChain` לא נשברות מהוספת ה-tap).

## 7. סיכונים, נסיגה, ולא-מטרות מכוונות

- **סיכון אמיתי (מ-QA):** טאב ברקע → `AudioContext` נכנס ל-`interrupted` → הקלטה עוצרת בפועל
  בלי סימן. **לא נפתר בגרסה הזו** (זהה למגבלה הקיימת של נגינה רגילה בטאב ברקע — לא רגרסיה
  ספציפית להקלטה). ייבדק ויתועד ב-HANDOFF כחוב אם משוחזר, לא "יתוקן שקט".
  <br>**סיכון אמיתי שני (Sampler):** קיבולת buffer בסלוט סאמפלר. Sample rate mismatch כבר חוב
  ידוע (HANDOFF: אין טיפול ב-sample-rate mismatch, v0.18) — לא מורחב כאן.
- **נסיגה:** כל שינוי הוא תוספתי (קבצים חדשים + שדות אופציונליים חדשים על טיפוסים קיימים) —
  אין מחיקה/שינוי-משמעות של שדה קיים. Rollback = הסרת הקבצים החדשים + reverting שני השדות
  האופציונליים; שום קוד קיים לא תלוי בהם.
- **לא-מטרות מכוונות (מה-spec, לא נשכחות כאן):** אין binding ל-FLX4; אין streaming-to-disk;
  אין FLAC/OGG/שידור; אין דריסת סלוט תפוס.

## 8. סדר ביצוע מסודר, עם אימות אחרי כל שלב משמעותי

1. `core/wav.ts` + `tests/core/wav.test.ts` — ירוק לפני שנוגעים ב-audio אמיתי.
2. `core/recording.ts` + `tests/core/recording.test.ts` — כנ"ל.
3. `recorder-processor.ts` + `recorder-tap.ts` + `ensureRecorderEngine`/`createMasterTap`
   ב-`engine.ts` — אימות ידני בדפדפן: `createMasterTap()` מחזיר chunks אמיתיים תוך כדי נגינה,
   בלי להשפיע על מה שנשמע (הוכחה ש"זה ענף, לא שרשרת").
4. **הפרוסה הדקה (סעיף 2):** `startRecordMaster`/`stopRecordMaster` גרידא (בלי UI, בלי שמירה)
   — לוג ל-console כמה bytes נאספו על 5 שניות אמיתיות, מול חשבון ידני.
5. `recorder-fsaccess/writer.ts` + חיווט `saveRecordedMaster`/`discardRecordedMaster` — אימות:
   5 שניות מוקלטות → קובץ WAV → נפתח בנגן חיצוני, משך תואם.
6. `sampler-recordings-idb/store.ts` + `SamplerEngine.buildBufferFromChunks` +
   `startSamplerCapture`/`stopSamplerCapture` + הרחבת `core/sampler.ts`/`sampler-idb/store.ts`
   — אימות: הקלטה לסלוט ריק, מנגנת מיד, שורדת רענון דף.
7. UI: `PadGrid.tsx` (כפתור הקלט + טוקן ויזואלי) + `TopBar.tsx` (`RecordingBadge`) +
   `store.ts`'s `recording`/`armedSlot` — אימות ויזואלי בדפדפן אמיתי (לא רק tsc).
8. חיתוך לפי טראק: `markRecordingTrackBoundary` + `splitByTrackBoundaries` בשימוש +
   `saveSplitMasterRecording` (תיקייה + cue sheet) — אימות: הקלטה עם 2 סימונים → 3 קבצים +
   cue sheet קריא.
9. עדכון `CLAUDE.md`/`CLAUDE-HE.md` (הסייג ל"לא כותבים לקבצי משתמש") — **באותו commit** אחד
   מהצעדים למעלה, לא commit נפרד בסוף.
10. בדיקת רגרסיה מלאה (סעיף 6) + `npm run check` ירוק + עדכון `HANDOFF.md`/`ROADMAP.md` +
    סקירת `change-reviewer` + הודעת בדיקה בעברית לשלום — סגירת הגרסה.
