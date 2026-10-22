import { useState } from 'react';
import { Sheet } from './kit';
import { Icon } from './Icon';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { STEP_KINDS, kindInfo, procSummary } from '../lib/engine/procedures';
import type { Field, StepKind, TemplateStep } from '../lib/types';
import { closeSheet } from './sheets';
import { toast } from './toast';
import { L } from '../lib/i18n';

export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** Sending happens outside the app; this only records what you confirm. */
export function StepConfirm({ procId, stepId }: { procId: string; stepId: string }) {
  const s = useApp();
  const p = s.procedures.find((x) => x.id === procId);
  const st = p?.steps.find((x) => x.id === stepId);
  const [note, setNote] = useState('');
  if (!p || !st) return null;
  const share = async () => {
    const r = await shareText(p.title, procSummary(p));
    if (r === 'copied') toast(L('نُسخ النص — الصقه في المحادثة ثم ارجع وأكّد الإرسال', "Text copied — paste it in the chat, then come back and confirm the send"));
  };
  return (
    <Sheet
      title={L(`تأكيد: ${st.title}`, `Confirm: ${st.title}`)}
      onClose={closeSheet}
      footer={
        <>
          <button
            className="btn primary grow"
            onClick={() => {
              A.toggleStep(procId, stepId, note.trim() || undefined);
              closeSheet();
              toast(L(`سُجل أنك أرسلت${st.target ? ` إلى ${st.target}` : ''}`, `Logged that you sent it${st.target ? ` to ${st.target}` : ''}`), { undoable: true });
            }}
          >
            <Icon name="check" size={17} />{L(" نعم، أرسلته فعلًا", " Yes, I actually sent it")}</button>
          <button className="btn" onClick={closeSheet}>{L("ليس بعد", "Not yet")}</button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="notice">
          <Icon name="info" size={18} />
          <div>{L("«مسار» لا يرسل شيئًا بالنيابة عنك. أكّد فقط إذا أرسلت", "Masar never sends anything on your behalf. Confirm only if you sent it")}{st.target ? L(` إلى «${st.target}»`, ` to “${st.target}”`) : ''}{L(" بنفسك — حتى يبقى السجل صادقًا.", " yourself — so the log stays honest.")}</div>
        </div>
        <button className="btn" onClick={share}>
          <Icon name="share" size={16} />{L(" مشاركة / نسخ ملخص الإجراء للإرسال", " Share / copy the procedure summary to send")}</button>
        <div className="field">
          <label>{L("ملاحظة (اختياري)", "Note (optional)")}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={L("مثال: عبر واتساب، بالإيميل، رقم المعاملة…", "e.g. via WhatsApp, by email, transaction number…")} />
        </div>
      </div>
    </Sheet>
  );
}

export function StepKindSelect({ value, onChange, compact }: { value: StepKind; onChange: (k: StepKind) => void; compact?: boolean }) {
  return (
    <select className="select" style={compact ? { width: 'auto', height: 36, padding: '0 10px', paddingInlineStart: 28, fontSize: 13 } : undefined} value={value} onChange={(e) => onChange(e.target.value as StepKind)} aria-label={L("نوع الخطوة", "Step type")}>
      {STEP_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
    </select>
  );
}

export function TemplateEditor({ id, fromProc }: { id?: string; fromProc?: string }) {
  const s = useApp();
  const src = id ? s.templates.find((t) => t.id === id) : undefined;
  const proc = fromProc ? s.procedures.find((p) => p.id === fromProc) : undefined;
  const [name, setName] = useState(src?.name || proc?.title || '');
  const [notes, setNotes] = useState(src?.notes || proc?.notes || '');
  const [steps, setSteps] = useState<TemplateStep[]>(src?.steps || proc?.steps.map((x) => ({ title: x.title, kind: x.kind, target: x.target })) || [{ title: '', kind: 'action' }]);
  const [fields, setFields] = useState<Field[]>(src?.fields || proc?.fields.map((f) => ({ key: f.key, value: '' })) || []);

  const save = () => {
    if (!name.trim()) return;
    A.saveTemplate({ id, name: name.trim(), notes, steps: steps.filter((x) => x.title.trim()), fields: fields.filter((f) => f.key.trim()) });
    closeSheet();
    toast(id ? L('حُفظ القالب', "Template saved") : L(`أُضيف القالب «${name.trim()}» — اكتب اسمه في الإضافة السريعة لاستخدامه`, `Template “${name.trim()}” added — type its name in quick add to use it`));
  };
  const upStep = (i: number, patch: Partial<TemplateStep>) => setSteps(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Sheet
      wide
      title={id ? L('تعديل القالب', "Edit template") : L('قالب إجراء جديد', "New procedure template")}
      onClose={closeSheet}
      footer={
        <>
          <button className="btn primary grow" onClick={save} disabled={!name.trim()}>{L("حفظ القالب", "Save template")}</button>
          {id && (
            <button className="icon-btn" onClick={() => { A.deleteTemplate(id); closeSheet(); toast(L('حُذف القالب', "Template deleted"), { undoable: true }); }} aria-label={L("حذف", "Delete")}>
              <Icon name="trash" size={18} />
            </button>
          )}
        </>
      }
    >
      <div className="fields">
        <div className="field">
          <label>{L("اسم القالب (تكتبه في بداية الإضافة السريعة لاستخدامه)", "Template name (type it at the start of quick add to use it)")}</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={L("مثال: معاملة", "e.g. Transaction")} />
        </div>
        <div className="field">
          <label>{L("الخطوات بالترتيب", "Steps in order")}</label>
          <div className="col" style={{ gap: 8 }}>
            {steps.map((st, i) => (
              <div key={i} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="faint small num" style={{ width: 16 }}>{i + 1}</span>
                <StepKindSelect compact value={st.kind} onChange={(k) => upStep(i, { kind: k })} />
                <input className="input grow" style={{ minWidth: 140 }} value={st.title} onChange={(e) => upStep(i, { title: e.target.value })} placeholder={kindInfo(st.kind).label + '…'} />
                <input className="input" style={{ width: 150 }} value={st.target || ''} onChange={(e) => upStep(i, { target: e.target.value || undefined })} placeholder={L("الجهة / المكان", "Party / place")} list="masar-targets" />
                <button className="icon-btn sm" onClick={() => i > 0 && setSteps(steps.map((x, j) => (j === i - 1 ? steps[i] : j === i ? steps[i - 1] : x)))} aria-label={L("لأعلى", "Move up")}><Icon name="up" size={15} /></button>
                <button className="icon-btn sm" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={L("حذف", "Delete")}><Icon name="x" size={15} /></button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSteps([...steps, { title: '', kind: 'action' }])}>
              <Icon name="plus" size={15} />{L(" خطوة", " Step")}</button>
          </div>
        </div>
        <div className="field">
          <label>{L("حقول تُعبأ لكل إجراء (مثل: الشركة، رقم الفاتورة)", "Fields to fill for each procedure (e.g. company, invoice no.)")}</label>
          <div className="col" style={{ gap: 8 }}>
            {fields.map((f, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <input className="input grow" value={f.key} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} placeholder={L("اسم الحقل", "Field name")} />
                <button className="icon-btn sm" onClick={() => setFields(fields.filter((_, j) => j !== i))} aria-label={L("حذف", "Delete")}><Icon name="x" size={15} /></button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setFields([...fields, { key: '', value: '' }])}>
              <Icon name="plus" size={15} />{L(" حقل", " Field")}</button>
          </div>
        </div>
        <div className="field">
          <label>{L("ملاحظات ثابتة", "Fixed notes")}</label>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={L("مثال: الملف الأصلي يُحفظ في الدرج الثاني", "e.g. the original goes in the second drawer")} />
        </div>
      </div>
    </Sheet>
  );
}
