// Optional Claude connection for the coach. The API key is the user's own and
// lives only in this browser's localStorage — never in the app state, so it is
// not part of backups or device transfers.

// the SDK is loaded only when the coach actually calls Claude, so it doesn't slow every page load
import type Anthropic from '@anthropic-ai/sdk';
import type { CoachMessage } from './types';
import { L } from './i18n';

const KEY = 'masar.aiKey';
export const COACH_MODEL = 'claude-opus-5-5';

export function getAiKey(): string {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setAiKey(k: string) {
  try {
    if (k.trim()) localStorage.setItem(KEY, k.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — the coach falls back to built-in messages */
  }
}

export const hasAiKey = () => !!getAiKey();

/** one Claude call; `messages` alternate user/assistant and end with a user turn */
export async function askClaude(system: string, messages: CoachMessage[], maxTokens = 2000): Promise<string> {
  const apiKey = getAiKey();
  if (!apiKey) throw new Error(L('أضف مفتاح Claude من الإعدادات أولًا.', 'Add your Claude key in settings first.'));
  const { default: SDK } = await import('@anthropic-ai/sdk');
  const client = new SDK({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const res = await client.beta.messages.create({
      model: COACH_MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
    });
    if (res.stop_reason === 'refusal') throw new Error(L('اعتذر المدرب عن هذا الطلب.', 'The coach declined this request.'));
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) throw new Error(L('لم يصل رد من المدرب.', 'No reply from the coach.'));
    return text;
  } catch (e) {
    if (e instanceof SDK.AuthenticationError) throw new Error(L('المفتاح غير صحيح — راجعه في الإعدادات.', 'The key is invalid — check it in settings.'));
    if (e instanceof SDK.PermissionDeniedError) throw new Error(L('المفتاح لا يملك صلاحية لهذا النموذج.', "This key can't use this model."));
    if (e instanceof SDK.RateLimitError) throw new Error(L('طلبات كثيرة — جرّب بعد دقيقة.', 'Too many requests — try again in a minute.'));
    if (e instanceof SDK.APIConnectionError) throw new Error(L('تعذر الاتصال — تأكد من الإنترنت.', "Couldn't connect — check your internet."));
    if (e instanceof SDK.APIError) throw new Error(L(`خطأ من الخدمة (${e.status}).`, `Service error (${e.status}).`));
    throw e;
  }
}
