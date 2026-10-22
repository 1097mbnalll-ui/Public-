import { useEffect, useState } from 'react';
import { Sheet } from './kit';
import { Icon } from './Icon';
import { getState } from '../lib/store';
import { LINK_LIMIT, newCode, prettyCode, seal, toB64url, transferLink } from '../lib/transfer';
import { todayKey } from '../lib/dates';
import { closeSheet } from './sheets';
import { toast } from './toast';

/** «انقل بياناتي»: one random code + an encrypted link (or file) you send to yourself */
export function TransferSheet() {
  const [code] = useState(newCode);
  const [packed, setPacked] = useState<Uint8Array | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    seal(getState(), code).then(setPacked).catch((e) => setErr(e?.message || 'تعذّر التجهيز'));
  }, [code]);

  const link = packed && toB64url(packed).length < LINK_LIMIT ? transferLink(packed) : null;
  const fileName = `masar-transfer-${todayKey()}.masar`;

  const shareLink = async () => {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: 'نقل بيانات مسار', text: 'افتح هذا الرابط على جهازك الآخر:', url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('نُسخ الرابط — أرسله لنفسك');
      }
    } catch {
      /* cancelled */
    }
  };
  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast('نُسخ الرابط');
    } catch {
      toast('تعذّر النسخ — استخدم زر المشاركة');
    }
  };
  const shareFile = async () => {
    if (!packed) return;
    const file = new File([packed as BlobPart], fileName, { type: 'application/octet-stream' });
    try {
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'نقل بيانات مسار' });
    } catch {
      return;
    }
    saveFile();
  };
  const saveFile = () => {
    if (!packed) return;
    const url = URL.createObjectURL(new Blob([packed as BlobPart], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Sheet title="انقل بياناتك لجهاز آخر" onClose={closeSheet}>
      <div className="col" style={{ gap: 16 }}>
        <div className="glass" style={{ textAlign: 'center' }}>
          <div className="faint small">كود النقل — احفظه عندك ولا ترسله مع الرابط</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '.08em', direction: 'ltr', margin: '8px 0 4px', userSelect: 'all' }}>{prettyCode(code)}</div>
          <div className="faint tiny">بدون هذا الكود لا يمكن فتح الرابط أو الملف.</div>
        </div>

        {err && <div className="notice red">{err}</div>}
        {!packed && !err && <div className="muted small" style={{ textAlign: 'center' }}>جارٍ التشفير…</div>}

        {packed && (
          <>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>1. أرسل الرابط لنفسك (واتساب، إيميل، ملاحظات…)</div>
              {link ? (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary grow" onClick={shareLink}><Icon name="share" size={16} /> مشاركة الرابط</button>
                  <button className="btn" onClick={copyLink}><Icon name="copy" size={16} /> نسخ</button>
                </div>
              ) : (
                <div className="notice amber small">بياناتك أكبر من أن تُرسل كرابط — استخدم الملف بالأسفل.</div>
              )}
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn sm" onClick={shareFile}><Icon name="share" size={14} /> مشاركة كملف</button>
                <button className="btn sm ghost" onClick={saveFile}><Icon name="download" size={14} /> حفظ الملف</button>
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>2. على الجهاز الآخر</div>
              <div className="small muted">افتح الرابط (أو من «أنت» ← «استقبل من ملف»)، ثم اكتب الكود. تقدر تستبدل بيانات ذلك الجهاز أو تدمجها.</div>
            </div>
            <div className="notice small">
              <Icon name="shield" size={16} />
              <div>البيانات مشفّرة على جهازك قبل الإرسال، ولا تمر على أي خادم. الرابط لا يُفتح إلا بكوده، ولكل نقل كود جديد.</div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
