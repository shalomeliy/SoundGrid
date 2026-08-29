# ארכיון ה‑HANDOFF

`HANDOFF.md` בשורש מחזיק את **ההווה בלבד**. כשגרסה נסגרת הבלוק שלה עובר לכאן ולא
נקרא שוב אלא אם שאלה היסטורית דורשת אותו. הסיבה מדודה: ב‑29/08 `HANDOFF.md` גדל
ב‑97% ביום אחד והוא הקובץ הראשון שנקרא בכל שיחה — כלומר עלות ההקשר הגדולה ביותר
בריפו. הפיצול הזה נעשה ב‑v0.2.1, יחד עם בדיקה שמקבעת אותו
(`tests/repo/handoff-size.test.ts`).

## גרסאות

| גרסה | מה יש שם |
| --- | --- |
| [v0.1.5](v0.1.5.md) | Design overhaul, סבב הליטוש מול Serato, ה‑docs שנוספו |
| [v0.1.7](v0.1.7.md) | `tags.ts` — ID3v2/MP4/Vorbis/RIFF/AIFF, `parseKey`→Camelot, המדידה על 360 קבצים |
| [v0.2.0](v0.2.0.md) | מנוע ה‑scratch, הפלטר והג'וג, שתי הסקירות, הכשלת ה‑worklet בכוונה |
| [v0.2.1](v0.2.1.md) | פיצול המסמכים + האינווריאנטים ברמת הריפו (המסמך הזה) |

v0.1.0 ו‑v0.1.6 לא קיבלו בלוק משלהן ב‑`HANDOFF.md` בזמנן; מה שיש עליהן נמצא
ב‑`ROADMAP.md` וב‑`git log`.

## יומן שיחות

| תאריך | גרסה | מה נעשה | CLEAR אחרי? |
| --- | --- | --- | --- |
| 2026-08-27 | v0.1.0 | scaffold, מנוע אודיו, decks, mixer, waveform, library, MIDI + FLX4, ריפו ציבורי בגיטהאב | — |
| 2026-08-28 | — | ROADMAP.md (20 גרסאות), HANDOFF.md, נוהל שיחה | — |
| 2026-08-28 | — | codegraph init בפרויקט; הוספת v0.1.5 (design overhaul) לרודמפ | 🟢 שיחה חדשה לפני v0.1.5 |
| 2026-08-28 | v0.1.5 | שכתוב שפת עיצוב: tokens+Inter, Button/Knob/Fader, Deck+Platter, Waveform, Mixer, TopBar, Library + מצבים. build+lint ירוק. ממתין לבדיקה ויזואלית | אחרי ליטוש |
| 2026-08-28 | v0.1.5 | +DnD, +recommend.ts (mix highlight), תיקון גלילה, תיקון feedback loop של הקנבס, כיול פריסה ל‑1536×710. docs: serato-formats + architecture/directions. ROADMAP: גרסאות .5/.6/.7. 13 commits מקומיים, לא נדחף | 🟢 שיחה חדשה — לסיים ליטוש + push |
| 2026-08-29 | v0.2.1 ✅ | `vitest` נכנס לריפו; `HANDOFF.md` פוצל (43,916→13,512 בייטים, ‎-70%) והגרסאות הסגורות עברו לכאן; חמישה אינווריאנטים ב‑`tests/repo/` — כל אחד הוכח נופל בלי התיקון שלו. הבדיקות תפסו קישור שבור ב‑`README.md` ונתיבים מתים בארכיון ובשני קבצי ה‑CLAUDE. **הסקירה תפסה שהבדיקה עצמה פספסה את מפת הארכיטקטורה** — היא דרשה קידומת `src/` והמפה כתובה כעץ מוזח; אחרי ההרחבה לבדיקת סיומת היא מצאה עוד שלושה נתיבים מתים | — |
| 2026-08-29 | v0.2.0a ✅ | מנוע scratch: `AudioWorklet` עם מצביע קריאה חתום מחליף את `AudioBufferSourceNode` (שקופא ופולט DC באחורה/עצירה). `SourcePlayer` עם fallback גלוי, anchors+epoch למיקום, סוף‑טראק כהודעה. נמדד: זהות ביט‑לביט במהירות 1.0, 4500/4500 אחורה, ‎-999dBFS ב‑0. תפס אפנון Nyquist ב‑gain ו‑`addModule` שמשקר | — |
| 2026-08-28 | v0.1.7 ✅ | `library/tags.ts` <!-- dead-path --> — ID3v2/MP4/Vorbis/RIFF/AIFF + parseKey→Camelot; `readLibraryTags` פאס שני batched; עמודות Artist/Key; `mixRecommendations` עם התאמת סולם. נמדד: BPM 96.9%, Key 97.2%, Duration 100%, 0.6ש' על 360 קבצים | 🟢 מומלץ `/clear` |
