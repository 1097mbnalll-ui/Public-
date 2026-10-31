// The Android app's own extras: bank texts that arrived become expenses when the app opens, and
// the home-screen shortcut «مصروف جديد» opens the expense form. Nothing here runs on the web.

import { registerPlugin } from '@capacitor/core';
import { isNative } from '../lib/native';
import { addBankTexts, smsAdded } from '../lib/sync';
import { openSheet } from './sheets';

interface AppNative {
  status(): Promise<{ on: boolean; granted: boolean }>;
  enable(): Promise<{ on: boolean; granted: boolean }>;
  disable(): Promise<void>;
  take(): Promise<{ sms: { id: string; at: number; text: string }[] }>;
  pendingOpen(): Promise<{ what?: string | null }>;
  addListener(ev: 'open', fn: (d: { what: string }) => void): Promise<unknown>;
}

const Native = registerPlugin<AppNative>('MadarApp');

export const smsStatus = () => (isNative() ? Native.status().catch(() => ({ on: false, granted: false })) : Promise.resolve({ on: false, granted: false }));
export const smsEnable = () => Native.enable();
export const smsDisable = () => Native.disable();

async function pull() {
  try {
    const { sms } = await Native.take();
    smsAdded(addBankTexts(Array.isArray(sms) ? sms : []));
  } catch {
    /* an older app without the plugin */
  }
  try {
    const { what } = await Native.pendingOpen();
    if (what === 'expense') openSheet({ type: 'expense' });
  } catch {
    /* no shortcut */
  }
}

export function startAndroidExtras() {
  if (!isNative()) return;
  void pull();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void pull());
  void Native.addListener('open', (d) => d.what === 'expense' && openSheet({ type: 'expense' })).catch(() => {});
}

/** after switching it on: bring in what it found right away */
export const pullNow = pull;
