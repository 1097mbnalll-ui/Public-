import { useState } from 'react';
import { Empty, Sheet } from './kit';
import { Icon } from './Icon';
import { PageTop } from './PageTop';
import { useApp } from '../lib/store';
import * as A from '../lib/actions';
import { timeAgo } from '../lib/dates';
import type { Thought } from '../lib/types';
import { L } from '../lib/i18n';
import { closeSheet, openSheet } from './sheets';
import { toast } from './toast';
import { go } from './router';

// «أفكاري»: anything you don't want to forget — an idea, something to buy, a thing someone said.
// One line to save it from «اليوم», the + button, or the focus timer; later pin it, turn it into a
// task, set a reminder for it, or delete it.

const sorted = (list: Thought[]) => [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.at - a.at);

/** one line on «اليوم»: type, Enter, saved */
export function NoteCapture() {
  const [text, setText] = useState('');
  const save = () => {
    const v = text.trim();
    if (!v) return;
    A.addThought(v);
    setText('');
    toast(L('انحفظت في أفكارك 💡', 'Saved to your notes 💡'), { buttons: [{ label: L('أفكاري', 'My notes'), fn: () => go('notes') }], undoable: true });
  };
  return (
    <div className="nt-capture">
      <Icon name="note" size={17} />
      <input
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && save()}
        placeholder={L('فكرة أو شي خايف تنساه؟ اكتبه هنا…', 'An idea or something you might forget? Write it here…')}
        aria-label={L('فكرة جديدة', 'New note')}
        maxLength={2000}
      />
      {text.trim() && <button className="btn sm primary" onClick={save}>{L('احفظ', 'Save')}</button>}
    </div>
  );
}

function NoteRow({ t }: { t: Thought }) {
  return (
    <div className={`nt-row ${t.pinned ? 'pinned' : ''}`}>
      <button className="m" onClick={() => openSheet({ type: 'note', id: t.id })}>
        <span className="t">{t.text}</span>
        <small>{t.pinned ? '📌 ' : ''}{t.during ? L(`أثناء «${t.during}» · `, `During “${t.during}” · `) : ''}{timeAgo(t.at)}</small>
      </button>
      {(
        <button className="icon-btn sm" aria-label={t.pinned ? L('فك التثبيت', 'Unpin') : L('ثبّت', 'Pin')} onClick={() => A.updateThought(t.id, { pinned: !t.pinned })}>
          <Icon name="pin" size={15} />
        </button>
      )}
    </div>
  );
}

/** the full list: search, pinned first */
export function NotesPage() {
  const s = useApp();
  const [q, setQ] = useState('');
  const list = sorted(s.thoughts).filter((t) => !q.trim() || t.text.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="nt-page">
      <PageTop title={L('أفكاري', 'My notes')} sub={s.thoughts.length ? L(`${s.thoughts.length} ${s.thoughts.length === 1 ? 'فكرة' : 'أفكار'}`, `${s.thoughts.length} notes`) : undefined} back={{ label: L('اليوم', 'Today'), to: 'today' }} />
      <NoteCapture />
      {s.thoughts.length > 4 && <input className="input nt-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('ابحث في أفكارك…', 'Search your notes…')} aria-label={L('بحث', 'Search')} />}
      {s.thoughts.length ? (
        <div className="nt-list">{list.map((t) => <NoteRow key={t.id} t={t} />)}</div>
      ) : (
        <Empty icon="note" title={L('ولا فكرة لين الحين', 'No notes yet')}>{L('أي شي يطري عليك وخايف تنساه: فكرة مشروع، شي تشتريه، كلام قاله أحد، رقم… اكتبه فوق وارجع لشغلك.', "Anything that pops up that you don't want to forget: a project idea, something to buy, what someone said, a number… write it above and get back to work.")}</Empty>
      )}
    </div>
  );
}

/** open one note: edit it, pin it, make it a task or a reminder, or delete it */
export function NoteSheet({ id, text: initial }: { id?: string; text?: string }) {
  const s = useApp();
  const t = id ? s.thoughts.find((x) => x.id === id) : undefined;
  const [text, setText] = useState(t?.text ?? initial ?? '');
  const save = () => {
    const v = text.trim();
    if (t) {
      if (v && v !== t.text) A.updateThought(t.id, { text: v });
    } else if (v) {
      A.addThought(v);
      toast(L('انحفظت في أفكارك 💡', 'Saved to your notes 💡'), { buttons: [{ label: L('أفكاري', 'My notes'), fn: () => go('notes') }], undoable: true });
    }
    closeSheet();
  };
  return (
    <Sheet title={t ? L('فكرة', 'Note') : L('فكرة جديدة', 'New note')} onClose={save} footer={
      <>
        <button className="btn primary grow" disabled={!text.trim()} onClick={save}>{L('احفظ', 'Save')}</button>
        {t && <button className="btn ghost" aria-label={L('احذف', 'Delete')} onClick={() => { A.removeThought(t.id); closeSheet(); toast(L('انحذفت', 'Deleted'), { undoable: true }); }}><Icon name="trash" size={15} /></button>}
      </>
    }>
      <div className="fields">
        <textarea className="textarea nt-text" autoFocus={!t} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={L('اكتب اللي في بالك…', 'Write what’s on your mind…')} />
        {t && (
          <>
            <small className="faint">{t.during ? L(`كتبتها أثناء «${t.during}» · `, `Written during “${t.during}” · `) : ''}{timeAgo(t.at)}</small>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => A.updateThought(t.id, { pinned: !t.pinned })}><Icon name="pin" size={14} /> {t.pinned ? L('فك التثبيت', 'Unpin') : L('ثبّت فوق', 'Pin to top')}</button>
              <button className="btn sm" onClick={() => { const v = text.trim() || t.text; const tid = A.addTask({ title: v.split('\n')[0].slice(0, 200), ...(v.includes('\n') ? { notes: v } : {}) }); A.removeThought(t.id); closeSheet(); toast(L('صارت مهمة', 'Turned into a task'), { buttons: [{ label: L('تفاصيل', 'Details'), fn: () => openSheet({ type: 'task', id: tid }) }] }); }}><Icon name="tasks" size={14} /> {L('حوّلها لمهمة', 'Make it a task')}</button>
              <button className="btn sm" onClick={() => { const v = text.trim() || t.text; if (v !== t.text) A.updateThought(t.id, { text: v }); openSheet({ type: 'remind', title: v.split('\n')[0].slice(0, 120), ref: 'notes' }); }}><Icon name="bell" size={14} /> {L('ذكّرني فيها', 'Remind me')}</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
