import { useEffect, useState } from 'react';
import { Empty, Group, Row, Seg } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { getState, useApp } from '../lib/store';
import { quotaMessage } from '../ui/StudySheets';
import { deleteCourse, importCoursePack, readCoursePack, type CoursePack } from '../lib/actions';
import { daysWord, fmtDate, fmtMinutes, todayKey } from '../lib/dates';
import { go, useRoute } from '../ui/router';
import { toast } from '../ui/toast';
import { PageTop } from '../ui/PageTop';

/** #/import?src=courses/xxx.json — preview a ready-made course and add it */
export function Import() {
  const s = useApp();
  const src = useRoute().query.get('src');
  const [pack, setPack] = useState<CoursePack | null>(null);
  const [err, setErr] = useState('');
  // exam details, prefilled from the package when it has them
  const [examTitle, setExamTitle] = useState('الميد');
  const [examDate, setExamDate] = useState('');
  const [reviewDays, setReviewDays] = useState(2);

  useEffect(() => {
    if (!src || /^https?:|\/\//.test(src)) return setErr('رابط الاستيراد غير صالح.');
    fetch(`${src.replace(/^\/+/, '')}?v=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('تعذر تحميل الملف.'))))
      .then((j) => {
        const p = readCoursePack(j);
        setPack(p);
        if (p.exam) {
          setExamTitle(p.exam.title);
          setExamDate(p.exam.date);
          setReviewDays(p.exam.reviewDays ?? 2);
        }
      })
      .catch((e) => setErr(e.message || 'تعذر تحميل الملف.'));
  }, [src]);

  if (err) return <div><PageTop title="استيراد مادة" back={{ label: 'الدراسة', to: 'study' }} /><div className="card"><Empty icon="alert" title={err} /></div></div>;
  if (!pack) return <div className="card"><Empty icon="study" title="جارٍ التحميل…" /></div>;

  const total = pack.units.reduce((a, u) => a + u.size, 0);
  const existing = s.courses.find((c) => c.name.trim() === pack.course.name.trim());
  const pastDate = !!examDate && examDate < todayKey();
  const add = (replace = false) => {
    if (replace && existing) deleteCourse(existing.id);
    const exam = examDate && !pastDate ? { title: examTitle.trim() || 'اختبار', date: examDate, reviewDays } : undefined;
    const id = importCoursePack({ ...pack, exam });
    const examId = getState().exams.find((e) => e.courseId === id)?.id;
    toast((examId && quotaMessage(examId)) || `أُضيفت ${pack.course.name}`, { ms: 8000 });
    go(`study/${id}`);
  };

  return (
    <div>
      <PageTop
        back={{ label: 'الدراسة', to: 'study' }}
        title={pack.course.name}
        sub={`${pack.units.length} دروس · ${total} ${pack.course.sizeLabel || 'صفحة'} ≈ ${fmtMinutes(total * (pack.course.paceGuess || 1))}`}
      />
      <div className="stack">
        {pack.course.notes && <p className="muted small" style={{ margin: 0 }}>{pack.course.notes}</p>}

        <section>
          <div className="group-title"><span>الاختبار</span></div>
          <div className="card fields">
            <div className="fields two">
              <div className="field">
                <label>اسمه</label>
                <input className="input" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} />
              </div>
              <div className="field">
                <label>متى؟</label>
                <input type="date" className="input" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>أيام للمراجعة قبله</label>
              <Seg value={reviewDays} onChange={setReviewDays} options={[0, 1, 2, 3].map((n) => ({ v: n, l: n ? daysWord(n) : 'بدون' }))} />
            </div>
            <div className="faint tiny">
              {pastDate ? 'هذا التاريخ مضى — لن يُضاف الاختبار.' : examDate ? `${fmtDate(examDate)} — الخطة اليومية تُحسب على هذا الموعد.` : 'تقدر تتركه فارغًا وتضيف الموعد لاحقًا من صفحة المادة، لكن بدونه لا توجد خطة يومية.'}
            </div>
          </div>
        </section>

        {existing && <div className="notice amber">عندك مادة بنفس الاسم. «استبدل الموجودة» يحذفها مع دروسها واختبارها وجلساتها ويضع هذه مكانها.</div>}

        <div className="row wrap" style={{ gap: 8 }}>
          {existing ? (
            <>
              <button className="btn primary" onClick={() => add(true)}>استبدل الموجودة</button>
              <button className="btn" onClick={() => add()}>أضف كنسخة جديدة</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => add()}><Icon name="plus" size={16} /> أضف المادة</button>
          )}
          <button className="btn ghost" onClick={() => go('study')}>إلغاء</button>
        </div>

        <Group title="الدروس">
          {pack.units.map((u, i) => (
            <Row key={i} label={u.title} value={`${u.size} ${pack.course.sizeLabel === 'دقيقة فيديو' || pack.course.sizeLabel === 'دقيقة' ? 'د' : pack.course.sizeLabel || ''}`} />
          ))}
        </Group>
        <p className="faint tiny" style={{ margin: 0 }}>لا يُمسح شيء من بياناتك الأخرى. تقدر تعدّل أو تحذف أي درس بعد الإضافة.</p>
      </div>
    </div>
  );
}
