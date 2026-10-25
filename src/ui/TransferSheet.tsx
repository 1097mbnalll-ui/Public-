import { useEffect, useState } from 'react';
import { Sheet } from './kit';
import { Icon } from './Icon';
import { getState } from '../lib/store';
import { LINK_LIMIT, newCode, prettyCode, seal, toB64url, transferLink } from '../lib/transfer';
import { todayKey } from '../lib/dates';
import { closeSheet } from './sheets';
import { toast } from './toast';
import { L } from '../lib/i18n';

/** «انقل بياناتي»: one random code + an encrypted link (or file) you send to yourself */
export function TransferSheet() {
  const [code] = useState(newCode);
  const [packed, setPacked] = useState<Uint8Array | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    seal(getState(), code).then(setPacked).catch((e) => setErr(e?.message || L('تعذّر التجهيز', "Couldn't prepare the transfer")));
  }, [code]);

  const link = packed && toB64url(packed).length < LINK_LIMIT ? transferLink(packed) : null;
  const fileName = `masar-transfer-${todayKey()}.masar`;

  const shareLink = async () => {
    if (!link) return;
    try {
      if (navigator.share) await navigator.share({ title: L('نقل بيانات مدار', "Madar data transfer"), text: L('افتح هذا الرابط على جهازك الآخر:', "Open this link on your other device:"), url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast(L('نُسخ الرابط — أرسله لنفسك', "Link copied — send it to yourself"));
      }
    } catch {
      /* cancelled */
    }
  };
  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast(L('نُسخ الرابط', "Link copied"));
    } catch {
      toast(L('تعذّر النسخ — استخدم زر المشاركة', "Couldn't copy — use the share button"));
    }
  };
  const shareFile = async () => {
    if (!packed) return;
    const file = new File([packed as BlobPart], fileName, { type: 'application/octet-stream' });
    try {
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: L('نقل بيانات مدار', "Madar data transfer") });
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
    <Sheet title={L("انقل بياناتك لجهاز آخر", "Move your data to another device")} onClose={closeSheet}>
      <div className="col" style={{ gap: 16 }}>
        <div className="glass" style={{ textAlign: 'center' }}>
          <div className="faint small">{L("كود النقل — احفظه عندك ولا ترسله مع الرابط", "Transfer code — keep it, don't send it with the link")}</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '.08em', direction: 'ltr', margin: '8px 0 4px', userSelect: 'all' }}>{prettyCode(code)}</div>
          <div className="faint tiny">{L("بدون هذا الكود لا يمكن فتح الرابط أو الملف.", "Without this code the link or file can't be opened.")}</div>
        </div>

        {err && <div className="notice red">{err}</div>}
        {!packed && !err && <div className="muted small" style={{ textAlign: 'center' }}>{L("جارٍ التشفير…", "Encrypting…")}</div>}

        {packed && (
          <>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>{L("1. أرسل الرابط لنفسك (واتساب، إيميل، ملاحظات…)", "1. Send yourself the link (WhatsApp, email, notes…)")}</div>
              {link ? (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn primary grow" onClick={shareLink}><Icon name="share" size={16} />{L(" مشاركة الرابط", " Share link")}</button>
                  <button className="btn" onClick={copyLink}><Icon name="copy" size={16} />{L(" نسخ", " Copy")}</button>
                </div>
              ) : (
                <div className="notice amber small">{L("بياناتك أكبر من أن تُرسل كرابط — استخدم الملف بالأسفل.", "Your data is too big for a link — use the file below.")}</div>
              )}
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn sm" onClick={shareFile}><Icon name="share" size={14} />{L(" مشاركة كملف", " Share as file")}</button>
                <button className="btn sm ghost" onClick={saveFile}><Icon name="download" size={14} />{L(" حفظ الملف", " Save file")}</button>
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>{L("2. على الجهاز الآخر", "2. On the other device")}</div>
              <div className="small muted">{L("افتح الرابط (أو من «أنت» ← «استقبل من ملف»)، ثم اكتب الكود. تقدر تستبدل بيانات ذلك الجهاز أو تدمجها.", "Open the link (or “You” → “Receive from file”), then type the code. You can replace that device's data or merge it.")}</div>
            </div>
            <div className="notice small">
              <Icon name="shield" size={16} />
              <div>{L("البيانات مشفّرة على جهازك قبل الإرسال، ولا تمر على أي خادم. الرابط لا يُفتح إلا بكوده، ولكل نقل كود جديد.", "The data is encrypted on your device before sending and never passes through a server. The link only opens with its code, and every transfer gets a new code.")}</div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
