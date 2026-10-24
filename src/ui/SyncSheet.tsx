import { useState } from 'react';
import { Collapse, Sheet } from './kit';
import { Icon } from './Icon';
import { closeSheet } from './sheets';
import { toast } from './toast';
import { connect, joinFromLink, pairLink, pendingSetup, smsHookUrl, stopSync, syncNow, useSyncConf, validScriptUrl } from '../lib/sync';
import { serverCode } from '../lib/syncServer';
import { timeAgo } from '../lib/dates';
import { L } from '../lib/i18n';

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    prompt(L('انسخ من هنا:', 'Copy from here:'), text);
  }
}

/** sync between the user's devices through their own Google account */
export function SyncSheet() {
  const conf = useSyncConf();
  return (
    <Sheet title={L('المزامنة بين أجهزتك', 'Sync across your devices')} onClose={closeSheet}>
      {conf ? <Connected /> : <Setup />}
    </Sheet>
  );
}

function Setup() {
  const [url, setUrl] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>, ok: string) => {
    setErr('');
    setBusy(true);
    try {
      await fn();
      toast(ok, { ms: 6000 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fields">
      <div className="faint small">{L('بياناتك تنحفظ في حسابك أنت في قوقل (مجاني)، وتنرفع مشفّرة بمفتاح يبقى على أجهزتك. بعدها كل تعديل يوصل لجهازك الثاني لحاله، ورسائل البنك تدخل مصاريفك بدون ما تلمس شي.', 'Your data is kept in your own Google account (free), uploaded encrypted with a key that stays on your devices. After that every change reaches your other device by itself, and bank messages land in your spending untouched.')}</div>

      <section className="sync-box">
        <b>{L('عندك «مسار» مربوط على جهاز ثاني؟', 'Already set up on another device?')}</b>
        <div className="faint tiny">{L('من الجهاز الثاني: الإعدادات ← المزامنة ← «اربط جهاز ثاني»، والصق الرابط هنا.', 'On the other device: Settings → Sync → “Link another device”, then paste the link here.')}</div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder={L('الصق رابط الربط', 'Paste the pairing link')} />
          <button className="btn primary" disabled={!link.trim() || busy} onClick={() => run(() => joinFromLink(link), L('تم الربط — بياناتك صارت هنا ✓', 'Linked — your data is here ✓'))}>{L('اربط', 'Link')}</button>
        </div>
      </section>

      <Collapse title={L('أول مرة؟ جهّزها (٥ دقايق، مرة وحدة)', 'First time? Set it up (5 minutes, once)')} defaultOpen>
        <ol className="m-guide">
          <li>
            {L('انسخ الكود:', 'Copy the code:')}{' '}
            <button className="btn sm" onClick={() => copy(serverCode(pendingSetup().token), L('نُسخ الكود ✓', 'Code copied ✓'))}><Icon name="copy" size={14} /> {L('انسخ الكود', 'Copy code')}</button>
          </li>
          <li>
            {L('افتح ', 'Open ')}
            <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer">script.google.com</a>
            {L(' وسجّل بحساب قوقل حقك. امسح الموجود والصق الكود، واضغط 💾 حفظ.', ' and sign in with your Google account. Delete what’s there, paste the code, press 💾 Save.')}
          </li>
          <li>{L('اضغط «نشر» (Deploy) ← «عملية نشر جديدة» ← ⚙️ اختر «تطبيق ويب» (Web app).', 'Press Deploy → New deployment → ⚙️ choose “Web app”.')}</li>
          <li>{L('«التنفيذ باسم»: أنا · «من لديه حق الوصول»: أي شخص (Anyone) ← نشر.', '“Execute as”: Me · “Who has access”: Anyone → Deploy.')}</li>
          <li>{L('بيطلب إذن: اختر حسابك ← «خيارات متقدمة» (Advanced) ← «الانتقال إلى…» ← سماح. (التحذير لأن الكود حقك مو من متجر قوقل.)', 'It asks for permission: pick your account → Advanced → Go to… → Allow. (The warning is because the code is yours, not from Google’s store.)')}</li>
          <li>{L('انسخ «رابط تطبيق الويب» (ينتهي بـ ‎/exec) والصقه هنا:', 'Copy the “Web app URL” (ends in /exec) and paste it here:')}</li>
        </ol>
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
          <button className="btn primary" disabled={!validScriptUrl(url) || busy} onClick={() => run(() => connect(url), L('تم! المزامنة شغّالة ✓', 'Done! Sync is on ✓'))}>{busy ? '…' : L('شغّل', 'Start')}</button>
        </div>
        {url.trim() && !validScriptUrl(url) && <div className="faint tiny">{L('الرابط لازم يبدأ بـ script.google.com/macros/s/ وينتهي بـ ‎/exec', 'The link must start with script.google.com/macros/s/ and end with /exec')}</div>}
      </Collapse>
      {err && <div className="notice amber">{err}</div>}
    </div>
  );
}

function Connected() {
  const conf = useSyncConf()!;
  const [busy, setBusy] = useState(false);
  const shortcutAsk = L(
    `عند تلقي رسالة تحتوي على "شراء": أرسل محتوى الرسالة بطريقة POST إلى هذا الرابط، والجسم JSON فيه مفتاح text قيمته محتوى الرسالة. شغّلها فورًا بدون تأكيد. الرابط: ${smsHookUrl()}`,
    `When I get a message containing "Purchase": send the message content with POST to this URL, body JSON with key text = the message content. Run immediately without asking. URL: ${smsHookUrl()}`,
  );
  return (
    <div className="fields">
      <div className={`sync-status ${conf.error ? 'bad' : ''}`}>
        <Icon name={conf.error ? 'alert' : 'check'} size={16} />
        <span className="grow">
          {conf.error
            ? conf.error
            : conf.last
              ? L(`متزامن · آخر مزامنة ${timeAgo(conf.last)}`, `In sync · last synced ${timeAgo(conf.last)}`)
              : L('جاري أول مزامنة…', 'First sync…')}
        </span>
        <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); await syncNow(); setBusy(false); }}>{busy ? '…' : L('زامن الحين', 'Sync now')}</button>
      </div>

      <section className="sync-box">
        <b>📱 {L('اربط جهاز ثاني (التابلت مثلًا)', 'Link another device (e.g. a tablet)')}</b>
        <div className="faint tiny">{L('انسخ الرابط، وعلى الجهاز الثاني افتح «مسار» ← الإعدادات ← المزامنة والصقه. (لو نفس حساب أبل، النسخ هنا واللصق هناك يشتغل مباشرة.) لا ترسله لأحد — فيه مفتاح بياناتك.', 'Copy the link; on the other device open Masar → Settings → Sync and paste it. (Same Apple ID? Copy here, paste there.) Don’t share it — it holds your data key.')}</div>
        <button className="btn primary" onClick={() => copy(pairLink(), L('نُسخ رابط الربط ✓', 'Pairing link copied ✓'))}><Icon name="copy" size={15} /> {L('انسخ رابط الربط', 'Copy pairing link')}</button>
      </section>

      <section className="sync-box">
        <b>📩 {L('رسائل البنك تدخل لحالها', 'Bank messages, automatically')}</b>
        <div className="faint tiny">{L('عدّل اختصار «حفظ رسائل الشراء» عشان يرسل الرسالة لحسابك بدل الملف. أسهل طريقة: افتح الاختصار، واكتب في خانة «Describe a change» تحت الوصف اللي تنسخه هنا.', 'Change the “save purchase messages” Shortcut to send the message to your account instead of the file. Easiest: open the Shortcut and paste the description below into “Describe a change”.')}</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => copy(shortcutAsk, L('نُسخ الوصف ✓ — الصقه في الاختصار', 'Description copied ✓ — paste it in the Shortcut'))}><Icon name="copy" size={15} /> {L('انسخ الوصف للاختصار', 'Copy the description')}</button>
          <button className="btn" onClick={() => copy(smsHookUrl(), L('نُسخ الرابط ✓', 'Link copied ✓'))}>{L('انسخ الرابط فقط', 'Copy link only')}</button>
        </div>
        <Collapse title={L('أو عدّله بنفسك', 'Or edit it yourself')}>
          <ol className="m-guide">
            <li>{L('في الاختصار احذف «إلحاق بملف نصي».', 'In the Shortcut delete “Append to Text File”.')}</li>
            <li>{L('أضف «الحصول على محتويات عنوان URL» (Get Contents of URL) والصق الرابط.', 'Add “Get Contents of URL” and paste the link.')}</li>
            <li>{L('الأسلوب: POST · نص الطلب: JSON · أضف حقل نص اسمه text وقيمته «مُدخل الاختصار ← المحتوى».', 'Method: POST · Request Body: JSON · add a Text field named text = “Shortcut Input → Content”.')}</li>
            <li>{L('تأكد إن الأتمتة على «تشغيل فورًا».', 'Make sure the automation is set to “Run Immediately”.')}</li>
          </ol>
        </Collapse>
        <div className="faint tiny">{L('الرسائل تنتظر في حسابك لين تفتح «مسار» على أي جهاز، وبعدها تنضاف وتنمسح من هناك.', 'Messages wait in your account until you open Masar on any device; then they’re added and removed from there.')}</div>
      </section>

      <button className="btn ghost danger" onClick={() => { if (confirm(L('توقف المزامنة على هذا الجهاز؟ بياناتك تبقى هنا وفي حسابك.', 'Stop syncing on this device? Your data stays here and in your account.'))) { stopSync(); toast(L('توقفت المزامنة على هذا الجهاز', 'Sync stopped on this device')); } }}>
        {L('أوقف المزامنة على هذا الجهاز', 'Stop syncing on this device')}
      </button>
    </div>
  );
}
