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
import { L, sz } from '../lib/i18n';
import { unpackLinkPack } from '../lib/transfer';
import { catInfo, fmtMoney } from '../lib/engine/money';

/** #/import?src=courses/xxx.json or ?pack=… — preview a ready-made course and/or tasks and add them */
export function Import() {
  const s = useApp();
  const route = useRoute();
  const src = route.query.get('src');
  const inline = route.query.get('pack');
  const [pack, setPack] = useState<CoursePack | null>(null);
  const [err, setErr] = useState('');
  // exam details, prefilled from the package when it has them
  const [examTitle, setExamTitle] = useState(L('الميد', "Midterm"));
  const [examDate, setExamDate] = useState('');
  const [reviewDays, setReviewDays] = useState(2);
  const [examTime, setExamTime] = useState<string | undefined>();

  useEffect(() => {
    // the pack can live inside the link itself (private: no file on the server) or in a file on the site
    let load: Promise<unknown>;
    if (inline) load = unpackLinkPack(inline).catch(() => Promise.reject(new Error(L('رابط الاستيراد تالف أو ناقص.', 'The import link is damaged or incomplete.'))));
    else if (!src || /^https?:|\/\//.test(src)) return setErr(L('رابط الاستيراد غير صالح.', "Invalid import link."));
    else load = fetch(`${src.replace(/^\/+/, '')}?v=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(L('تعذر تحميل الملف.', "Couldn't load the file.")))));
    load
      .then((j) => {
        const p = readCoursePack(j);
        setPack(p);
        if (p.exam) {
          setExamTitle(p.exam.title);
          setExamDate(p.exam.date);
          setReviewDays(p.exam.reviewDays ?? 2);
          setExamTime(p.exam.time);
        }
      })
      .catch((e) => setErr(e.message || L('تعذر تحميل الملف.', "Couldn't load the file.")));
  }, [src, inline]);

  if (err) return <div><PageTop title={L("استيراد مادة", "Import course")} back={{ label: L('الدراسة', "Study"), to: 'study' }} /><div className="card"><Empty icon="alert" title={err} /></div></div>;
  if (!pack) return <div className="card"><Empty icon="study" title={L("جارٍ التحميل…", "Loading…")} /></div>;

  const course = pack.course;
  const tasks = pack.tasks || [];
  const expenses = pack.expenses || [];
  const kinds = [course, tasks.length, expenses.length].filter(Boolean).length;
  const home = course ? 'study' : tasks.length ? 'tasks' : 'money';
  const homeLabel = course ? L('الدراسة', 'Study') : tasks.length ? L('المهام', 'Tasks') : L('مصاريفي', 'Spending');
  const total = pack.units.reduce((a, u) => a + u.size, 0);
  const existing = course && s.courses.find((c) => c.name.trim() === course.name.trim());
  const pastDate = !!examDate && examDate < todayKey();
  const add = (replace = false) => {
    if (replace && existing) deleteCourse(existing.id);
    const exam = course && examDate && !pastDate ? { title: examTitle.trim() || L('اختبار', "Exam"), date: examDate, time: examTime, reviewDays } : undefined;
    const id = importCoursePack({ ...pack, exam });
    const examId = id && getState().exams.find((e) => e.courseId === id)?.id;
    const tasksMsg = [tasks.length ? L(`${tasks.length} مهام`, `${tasks.length} tasks`) : '', expenses.length ? L(`${expenses.length} مصاريف`, `${expenses.length} expenses`) : ''].filter(Boolean).join(L(' و', ' and '));
    toast((examId && quotaMessage(examId)) || (course ? L(`أُضيفت ${course.name}`, `Added ${course.name}`) : L(`أُضيفت ${tasksMsg}`, `Added ${tasksMsg}`)), { ms: 8000 });
    go(id ? `study/${id}` : home);
  };
  const unitWord = course?.sizeLabel === 'دقيقة فيديو' || course?.sizeLabel === 'دقيقة';

  return (
    <div>
      <PageTop
        back={{ label: homeLabel, to: home }}
        title={course ? course.name : tasks.length ? L('مهام جديدة', 'New tasks') : L('مصاريف', 'Expenses')}
        sub={course
          ? L(`${pack.units.length} دروس · ${total} ${sz(course.sizeLabel)} ≈ ${fmtMinutes(total * (course.paceGuess || 1))}`, `${pack.units.length} lessons · ${total} ${course.sizeLabel || 'pages'} ≈ ${fmtMinutes(total * (course.paceGuess || 1))}`) + (tasks.length ? L(` · ${tasks.length} مهام`, ` · ${tasks.length} tasks`) : '')
          : [tasks.length ? L(`${tasks.length} مهام`, `${tasks.length} tasks`) : '', expenses.length ? L(`${expenses.length} مصاريف · ${fmtMoney(expenses.reduce((a, e) => a + e.amount, 0))}`, `${expenses.length} expenses · ${fmtMoney(expenses.reduce((a, e) => a + e.amount, 0))}`) : ''].filter(Boolean).join(' · ')}
      />
      <div className="stack">
        {course?.notes && <p className="muted small" style={{ margin: 0 }}>{course.notes}</p>}

        {course && (
          <section>
            <div className="group-title"><span>{L("الاختبار", "The exam")}</span></div>
            <div className="card fields">
              <div className="fields two">
                <div className="field">
                  <label>{L("اسمه", "Name")}</label>
                  <input className="input" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label>{L("متى؟", "When?")}</label>
                  <input type="date" className="input" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>{L("أيام للمراجعة قبله", "Review days before it")}</label>
                <Seg value={reviewDays} onChange={setReviewDays} options={[0, 1, 2, 3].map((n) => ({ v: n, l: n ? daysWord(n) : L('بدون', "None") }))} />
              </div>
              <div className="faint tiny">
                {pastDate ? L('هذا التاريخ مضى — لن يُضاف الاختبار.', "That date has passed — the exam won't be added.") : examDate ? L(`${fmtDate(examDate)}${examTime ? ` الساعة ${examTime}` : ''} — الخطة اليومية تُحسب على هذا الموعد.`, `${fmtDate(examDate)}${examTime ? ` at ${examTime}` : ''} — the daily plan is built around this date.`) : L('تقدر تتركه فارغًا وتضيف الموعد لاحقًا من صفحة المادة، لكن بدونه لا توجد خطة يومية.', "You can leave it empty and add the date later from the course page, but without it there's no daily plan.")}
              </div>
            </div>
          </section>
        )}

        {existing && <div className="notice amber">{L("عندك مادة بنفس الاسم. «استبدل الموجودة» يحذفها مع دروسها واختبارها وجلساتها ويضع هذه مكانها.", "You already have a course with this name. “Replace existing” deletes it with its lessons, exam and sessions and puts this one in its place.")}</div>}

        <div className="row wrap" style={{ gap: 8 }}>
          {existing ? (
            <>
              <button className="btn primary" onClick={() => add(true)}>{L("استبدل الموجودة", "Replace existing")}</button>
              <button className="btn" onClick={() => add()}>{L("أضف كنسخة جديدة", "Add as a new copy")}</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => add()}><Icon name="plus" size={16} />{kinds > 1 ? L(" أضف الكل", " Add all") : course ? L(" أضف المادة", " Add course") : tasks.length ? L(" أضف المهام", " Add tasks") : L(" أضف المصاريف", " Add expenses")}</button>
          )}
          <button className="btn ghost" onClick={() => go(home)}>{L("إلغاء", "Cancel")}</button>
        </div>

        {course && (
          <Group title={L("الدروس", "Lessons")}>
            {pack.units.map((u, i) => (
              <Row key={i} label={u.title} value={L(`${u.size} ${unitWord ? 'د' : course.sizeLabel || ''}`, `${u.size} ${unitWord ? 'min' : sz(course.sizeLabel)}`)} />
            ))}
          </Group>
        )}
        {tasks.length > 0 && (
          <Group title={L("المهام", "Tasks")}>
            {tasks.map((t, i) => (
              <Row key={i} label={t.title} sub={t.steps?.length ? L(`${t.steps.length} خطوات`, `${t.steps.length} steps`) : undefined} value={t.due ? fmtDate(t.due) + (t.dueTime ? ` ${t.dueTime}` : '') : ''} />
            ))}
          </Group>
        )}
        {expenses.length > 0 && (
          <Group title={L("المصاريف", "Expenses")}>
            {expenses.slice(0, 50).map((e, i) => (
              <Row key={i} label={`${catInfo(e.cat).emoji} ${e.title || catInfo(e.cat).label}`} sub={fmtDate(e.day)} value={fmtMoney(e.amount)} />
            ))}
          </Group>
        )}
        <p className="faint tiny" style={{ margin: 0 }}>{L("لا يُمسح شيء من بياناتك الأخرى. تقدر تعدّل أو تحذف أي شيء بعد الإضافة.", "Nothing else in your data is removed. You can edit or delete anything after adding.")}</p>
      </div>
    </div>
  );
}
