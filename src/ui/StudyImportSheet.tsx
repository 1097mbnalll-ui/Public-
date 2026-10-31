import { useState } from 'react';
import { Sheet } from './kit';
import { Icon } from './Icon';
import { closeSheet, openSheet } from './sheets';
import { go } from './router';
import { toast } from './toast';
import { useApp } from '../lib/store';
import { deleteCourse, importCoursePack, readStudyPack, type CoursePack } from '../lib/actions';
import { fmtDate, fmtMinutes, todayKey } from '../lib/dates';
import { L } from '../lib/i18n';

// «استورد موادك»: any AI chat interviews you about your courses (subjects, lessons, exam dates),
// estimates the minutes for each lesson, and answers with one block Madar reads. Paste it here:
// every course comes in at once, matched to the ones you already have, and the daily plan follows.

function studyPrompt(): string {
  const today = todayKey();
  return `أنت مساعد مذاكرة. مهمتك تجهّز موادي الدراسية لتطبيق «مدار» اللي يوزّع المذاكرة على الأيام قبل كل اختبار. تاريخ اليوم ${today} (${fmtDate(today)}).

أولًا اسألني، سؤال أو سؤالين كل مرة، لين تعرف:
١) وش موادي هالفصل.
٢) لكل مادة: الدروس أو الفصول اللي عليّ (أقدر أرسل لك المنهج أو صورة الخطة أو أكتبها).
٣) موعد كل اختبار (اليوم والساعة لو أعرفها)، وأي دروس داخلة فيه.
٤) مستواي في كل مادة (سهلة لي أو صعبة).

بعدها قدّر كم دقيقة يحتاج كل درس للمذاكرة أول مرة لطالب في مستواي (عادة ٢٠–٩٠ دقيقة؛ الفصل الطويل قسّمه لدروس أصغر)، واعرض عليّ الخطة باختصار وخذ موافقتي.

لما أوافق، أرسل JSON واحد فقط داخل كتلة \`\`\`json بدون أي كلام قبلها أو بعدها، بهذا الشكل:

{
  "app": "masar",
  "courses": [
    {
      "name": "اسم المادة",
      "sizeLabel": "دقيقة",
      "paceGuess": 1,
      "difficulty": 3,
      "units": [ { "title": "١) عنوان الدرس", "size": 45, "difficulty": 3 } ],
      "exam": { "title": "الميد", "date": "YYYY-MM-DD", "time": "HH:MM", "reviewDays": 2 }
    }
  ]
}

القواعد:
- size بالدقائق (لأن sizeLabel "دقيقة")، و difficulty من 1 (سهل جدًا) إلى 5 (صعب جدًا).
- الدروس بترتيب المنهج، ولكل مادة دروس الاختبار الجاي بس.
- exam: احذفه إذا ما فيه موعد. حوّل الأيام النسبية (الأحد الجاي، بعد أسبوعين) لتواريخ فعلية. الوقت بنظام 24 ساعة.
- reviewDays: أيام مراجعة قبل الاختبار (0 إذا الاختبار قريب جدًا).
- الـ JSON لازم يكون كامل وصالح.`;
}

/** two course names share a real word or number — «إنجليزي 106» ~ «ENGL 106» ~ «الإنجليزي» */
function sharesWord(a: string, b: string) {
  const words = (x: string) => new Set(x.toLowerCase().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/^ال|\sال/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
  const A = words(a);
  for (const w of words(b)) if (A.has(w)) return true;
  return false;
}

export function StudyImportSheet() {
  const s = useApp();
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [packs, setPacks] = useState<CoursePack[] | null>(null);
  // for each incoming course: '' = add as new, or the id of yours it replaces
  const [map, setMap] = useState<string[]>([]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(studyPrompt());
      toast(L('نُسخ الطلب — الصقه في أي ذكاء اصطناعي وجاوب أسئلته', 'Copied — paste it into any AI and answer its questions'), { ms: 6000 });
    } catch {
      setText(studyPrompt());
      setErr(L('ما قدرت أنسخ تلقائيًا — الطلب في المربع، انسخه من هنا.', "Couldn't copy — the prompt is in the box, copy it from there."));
    }
  };

  const read = () => {
    setErr('');
    const t = text.trim();
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    try {
      if (a < 0 || b < a) throw new Error(L('ما لقيت الرد — انسخ رد الذكاء الاصطناعي كامل (من { إلى }).', 'No reply found — copy the whole AI reply (from { to }).'));
      const list = readStudyPack(JSON.parse(t.slice(a, b + 1)));
      setPacks(list);
      setMap(list.map((p) => s.courses.find((c) => sharesWord(c.name, p.course!.name))?.id ?? ''));
    } catch (e) {
      setErr(e instanceof Error && e.message && !/JSON|Unexpected/.test(e.message) ? e.message : L('الرد ناقص أو فيه خطأ — اطلب منه يرسل الـ JSON كامل مرة ثانية.', 'The reply is incomplete — ask it to send the whole JSON again.'));
    }
  };

  const apply = () => {
    if (!packs) return;
    packs.forEach((p, i) => {
      if (map[i]) deleteCourse(map[i]);
      importCoursePack(p);
    });
    closeSheet();
    go('study');
    toast(L(`انضبطت ${packs.length} ${packs.length === 1 ? 'مادة' : 'مواد'} — خطة كل يوم جاهزة`, `${packs.length} courses set — your daily plan is ready`), { ms: 6000 });
  };

  if (packs) {
    return (
      <Sheet title={L('موادك من الذكاء الاصطناعي', 'Your courses from the AI')} onClose={closeSheet} footer={
        <>
          <button className="btn primary grow" onClick={apply}><Icon name="check" size={15} /> {L('اضبطها كلها', 'Set them all up')}</button>
          <button className="btn ghost" onClick={() => setPacks(null)}>{L('رجوع', 'Back')}</button>
        </>
      }>
        <div className="fields">
          {packs.map((p, i) => {
            const mins = p.units.reduce((a, u) => a + u.size, 0);
            return (
              <div key={i} className="si-course">
                <b>{p.course!.name}</b>
                <small>{L(`${p.units.length} دروس · ~${fmtMinutes(mins)} مذاكرة`, `${p.units.length} lessons · ~${fmtMinutes(mins)} of study`)}{p.exam ? L(` · الاختبار ${fmtDate(p.exam.date)}`, ` · exam ${fmtDate(p.exam.date)}`) : L(' · بدون موعد اختبار', ' · no exam date')}</small>
                {s.courses.length > 0 && (
                  <select className="select" value={map[i]} onChange={(e) => setMap(map.map((x, j) => (j === i ? e.target.value : x)))} aria-label={L('وين تروح؟', 'Where does it go?')}>
                    <option value="">{L('مادة جديدة', 'A new course')}</option>
                    {s.courses.map((c) => <option key={c.id} value={c.id}>{L(`تبدّل «${c.name}»`, `Replaces “${c.name}”`)}</option>)}
                  </select>
                )}
              </div>
            );
          })}
          {map.some(Boolean) && <small className="faint">{L('المادة اللي تتبدّل تنحذف بدروسها وتسجيلاتها، وتنضاف الجديدة مكانها.', 'A replaced course is removed with its lessons and logs, and the new one takes its place.')}</small>}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={L('استورد موادك', 'Import your courses')} onClose={closeSheet} footer={<button className="btn primary grow" disabled={!text.trim()} onClick={read}>{L('تابع', 'Continue')}</button>}>
      <div className="fields">
        <div className="ai-step">
          <b>1</b>
          <div>
            <div>{L('انسخ الطلب والصقه في أي ذكاء اصطناعي (ChatGPT، Claude، Gemini). بيسألك عن موادك ودروسها ومواعيد اختباراتها، ويقدّر كم دقيقة لكل درس.', 'Copy the prompt into any AI (ChatGPT, Claude, Gemini). It asks about your courses, lessons and exam dates, and estimates the minutes for each lesson.')}</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={copy}><Icon name="copy" size={14} />{L(' انسخ الطلب', ' Copy the prompt')}</button>
          </div>
        </div>
        <div className="ai-step">
          <b>2</b>
          <div className="grow">{L('لما يرسل لك الرد الأخير (الكتلة اللي تبدأ بـ {)، انسخه كامل والصقه هنا.', 'When it sends its final reply (the block starting with {), copy it all and paste it here.')}</div>
        </div>
        <textarea className="input" rows={6} dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={L('الصق هنا…', 'Paste here…')} />
        {err && <div className="notice amber">{err}</div>}
        <button className="btn sm ghost" onClick={() => openSheet({ type: 'ai-import' })}>{L('عندك ملخص أو مهام أو رابط «مدار»؟ الاستيراد العام', 'A summary, tasks or a Madar link? General import')}</button>
      </div>
    </Sheet>
  );
}
