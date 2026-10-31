package io.github.madar.planner;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Bank texts → expenses, on the phone. The receiver keeps bank-looking texts in a small queue;
 * the app takes them when it opens (`take`) and reads them with the same parser as pasted texts.
 * Also: the home-screen shortcut «مصروف جديد» leaves a note here for the app to open the form.
 */
@CapacitorPlugin(name = "MadarApp", permissions = { @Permission(strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS }, alias = "sms") })
public class SmsPlugin extends Plugin {
    private static final String PREFS = "madar_sms";
    // a purchase, an amount, a card — in Arabic or English; anything else stays private
    private static final Pattern BANK = Pattern.compile("(شراء|مبلغ|بطاقة|مدى|خصم|سحب|دفع|purchase|amount|card|SAR|ر\\.س|ريال|POS)", Pattern.CASE_INSENSITIVE);
    static volatile String pendingOpen = null;
    static volatile SmsPlugin instance = null;

    @Override
    public void load() {
        instance = this;
    }

    static boolean isOn(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false);
    }

    static synchronized void keep(Context c, String text, long at) {
        if (text == null || !BANK.matcher(text).find()) return;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray q = new JSONArray(p.getString("queue", "[]"));
            JSONObject m = new JSONObject();
            m.put("id", at + ":" + text.hashCode());
            m.put("at", at);
            m.put("text", text);
            q.put(m);
            // a few hundred at most, the oldest go first
            while (q.length() > 300) q.remove(0);
            p.edit().putString("queue", q.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** the shortcut was used: open the expense form (now if the app is running) */
    static void opened(String what) {
        pendingOpen = what;
        SmsPlugin p = instance;
        if (p != null) {
            JSObject d = new JSObject();
            d.put("what", what);
            p.notifyListeners("open", d);
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("on", isOn(getContext()));
        r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "afterPermission");
            return;
        }
        turnOn(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("on", false);
            r.put("granted", false);
            call.resolve(r);
            return;
        }
        turnOn(call);
    }

    /** switch on, and pick up the last week's bank texts so nothing recent is missed */
    private void turnOn(PluginCall call) {
        Context c = getContext();
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("on", true).apply();
        long since = System.currentTimeMillis() - 7L * 24 * 3600 * 1000;
        try (Cursor cur = c.getContentResolver().query(Uri.parse("content://sms/inbox"), new String[] { Telephony.Sms.BODY, Telephony.Sms.DATE }, Telephony.Sms.DATE + " > ?", new String[] { String.valueOf(since) }, Telephony.Sms.DATE + " ASC")) {
            if (cur != null) while (cur.moveToNext()) keep(c, cur.getString(0), cur.getLong(1));
        } catch (Exception ignored) {
        }
        JSObject r = new JSObject();
        r.put("on", true);
        r.put("granted", true);
        call.resolve(r);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("on", false).remove("queue").apply();
        call.resolve();
    }

    /** the bank texts waiting since last time; the queue empties */
    @PluginMethod
    public void take(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSArray list;
        synchronized (SmsPlugin.class) {
            try {
                list = new JSArray(p.getString("queue", "[]"));
            } catch (Exception e) {
                list = new JSArray();
            }
            p.edit().remove("queue").apply();
        }
        JSObject r = new JSObject();
        r.put("sms", list);
        call.resolve(r);
    }

    /** what the home-screen shortcut asked for, once */
    @PluginMethod
    public void pendingOpen(PluginCall call) {
        JSObject r = new JSObject();
        r.put("what", pendingOpen);
        pendingOpen = null;
        call.resolve(r);
    }
}
