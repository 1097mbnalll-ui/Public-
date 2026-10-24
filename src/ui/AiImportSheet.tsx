import { useState } from 'react';
import { Sheet } from './kit';
import { Icon } from './Icon';
import { closeSheet } from './sheets';
import { go } from './router';
import { toast } from './toast';
import { readCoursePack } from '../lib/actions';
import { packLinkPack } from '../lib/transfer';
import { fmtDate, todayKey } from '../lib/dates';
import { L } from '../lib/i18n';

/** the instruction any AI chat (Claude, ChatGPT, Gemini…) needs to turn notes or a task list into a Masar pack */
function aiPrompt(): string {
  const today = todayKey();
  return `أنت تجهّز بيانات لتطبيق «مسار» (منظّم مهام ومذاكرة). تاريخ اليوم ${today} (${fmtDate(today)}).
حوّل المحتوى اللي بأرسله تحت (ملخص مادة، موعد اختبار، قائمة مهام، مصاريف…) إلى JSON واحد فقط بهذا الشكل، داخل كتلة \`\`\`json وبدون أي كلام قبلها أو بعدها:

{
  "app": "masar",
  "course": { "name": "اسم المادة", "sizeLabel": "دقيقة", "paceGuess": 1, "difficulty": 3 },
  "units": [ { "title": "١) عنوان الدرس", "size": 40, "difficulty": 3, "notes": "## عنوان\\n- نقطة\\n- نقطة" } ],
  "exam": { "title": "الميد", "date": "YYYY-MM-DD", "time": "HH:MM", "reviewDays": 0 },
  "tasks": [ { "title": "المهمة", "due": "YYYY-MM-DD", "dueTime": "HH:MM", "priority": 2, "area": "study", "estimate": 30, "steps": ["خطوة", "خطوة"] } ],
  "expenses": [ { "title": "قهوة ستاربكس", "amount": 24, "date": "YYYY-MM-DD", "cat": "coffee" } ]
}

القواعد:
- ما فيه مادة؟ احذف course و units و exam. ما فيه مهام؟ احذف tasks. ما فيه اختبار؟ احذف exam. ما فيه مصاريف؟ احذف expenses.
- size: الدقائق المتوقعة لمذاكرة الدرس أول مرة (مع "sizeLabel": "دقيقة")، أو عدد صفحاته (مع "sizeLabel": "صفحة").
- difficulty: من 1 (سهل جدًا) إلى 5 (صعب جدًا).
- notes: ملخص منظّم للدرس؛ سطور تبدأ بـ "## " للعناوين و"- " للنقاط. لا تحذف أي قاعدة أو مثال مهم من المصدر.
- priority: 0 غير مهم، 1 عادي، 2 مهم، 3 عاجل. area: study للدراسة، work للعمل، life للحياة.
- حوّل الأيام النسبية (بكرة، الأحد الجاي…) إلى تواريخ فعلية من تاريخ اليوم. الوقت بنظام 24 ساعة.
- expenses: مصاريف بالريال؛ cat واحد من: food, coffee, delivery, transport, shopping, subs, bills, fun, study, health, other.
- reviewDays: أيام المراجعة قبل الاختبار (0 إذا الاختبار قريب).
- الـ JSON لازم يكون كامل وصالح؛ إذا المحتوى طويل جدًا اختصر notes ولا تقطعه.

المحتوى:
`;
}

/** paste a Masar link, or an AI's reply holding a pack, and open it in the import preview */
export function AiImportSheet() {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt());
      toast(L('نُسخ الأمر — الصقه في محادثة الذكاء الاصطناعي ومعه ملخصك أو مهامك', 'Prompt copied — paste it in the AI chat with your notes or tasks'), { ms: 6000 });
    } catch {
      setText(aiPrompt());
      setErr(L('ما قدرت أنسخ تلقائيًا — الأمر في المربع، انسخه من هنا.', "Couldn't copy automatically — the prompt is in the box, copy it from there."));
    }
  };

  const go2 = async () => {
    setErr('');
    const t = text.trim();
    const link = t.match(/#\/((?:import|receive)\?\S+)/);
    if (link) { closeSheet(); return go(link[1]); }
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    try {
      if (a < 0 || b < a) throw new Error();
      const raw = JSON.parse(t.slice(a, b + 1));
      if (raw && !raw.app) raw.app = 'masar';
      readCoursePack(raw); // validate before leaving the sheet
      const packed = await packLinkPack(raw);
      closeSheet();
      go(`import?pack=${packed}`);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : L('ما فهمت النص — انسخ رد الذكاء الاصطناعي كاملًا (الكتلة اللي تبدأ بـ { وتنتهي بـ }).', "Couldn't read that — copy the AI's whole reply (the block from { to })."));
    }
  };

  return (
    <Sheet
      title={L('استيراد', 'Import')}
      onClose={closeSheet}
      footer={<button className="btn primary grow" disabled={!text.trim()} onClick={go2}>{L('تابع', 'Continue')}</button>}
    >
      <div className="fields">
        <div className="ai-step">
          <b>1</b>
          <div>
            <div>{L('انسخ الأمر، والصقه في أي ذكاء اصطناعي (ChatGPT، Claude، Gemini) ومعه ملخصك أو مهامك أو مصاريفك.', 'Copy the prompt and paste it into any AI (ChatGPT, Claude, Gemini) along with your notes, tasks or spending.')}</div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={copy}><Icon name="copy" size={14} />{L(' انسخ الأمر', ' Copy prompt')}</button>
          </div>
        </div>
        <div className="ai-step">
          <b>2</b>
          <div className="grow">{L('انسخ رده كامل والصقه هنا — أو الصق رابط «مسار» وصلك.', 'Copy its whole reply and paste it here — or paste a Masar link you received.')}</div>
        </div>
        <textarea className="input" rows={6} dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={L('الصق هنا…', 'Paste here…')} />
        {err && <div className="notice amber">{err}</div>}
      </div>
    </Sheet>
  );
}
