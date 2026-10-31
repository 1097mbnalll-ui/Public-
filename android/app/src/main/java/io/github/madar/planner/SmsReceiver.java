package io.github.madar.planner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/**
 * A text arrives: if it reads like a bank purchase, keep it for the app to turn into an expense
 * (even while the app is closed). Personal messages are never kept — only bank-looking ones, and
 * only after you switched it on in «مصاريفي».
 */
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        if (!SmsPlugin.isOn(ctx)) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;
        StringBuilder body = new StringBuilder();
        for (SmsMessage m : parts) if (m != null && m.getMessageBody() != null) body.append(m.getMessageBody());
        long at = parts[0] != null ? parts[0].getTimestampMillis() : System.currentTimeMillis();
        SmsPlugin.keep(ctx, body.toString(), at);
    }
}
