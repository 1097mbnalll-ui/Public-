package io.github.madar.planner;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The study timer as a small floating window over other apps (Android picture-in-picture), so you
 * can watch a lesson video and keep the clock in sight. `setAuto` turns on shrinking into it when
 * you leave the app while a timer runs.
 */
@CapacitorPlugin(name = "MadarPip")
public class PipPlugin extends Plugin {
    static volatile boolean auto = false;

    static boolean supported(Activity a) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && a.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    @RequiresApi(api = Build.VERSION_CODES.O)
    static PictureInPictureParams params() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational(4, 5));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setAutoEnterEnabled(auto);
        return b.build();
    }

    static boolean enter(Activity a) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !supported(a)) return false;
        try {
            return a.enterPictureInPictureMode(params());
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject r = new JSObject();
        r.put("supported", supported(getActivity()));
        call.resolve(r);
    }

    @PluginMethod
    public void enter(PluginCall call) {
        Activity a = getActivity();
        a.runOnUiThread(() -> {
            JSObject r = new JSObject();
            r.put("ok", PipPlugin.enter(a));
            call.resolve(r);
        });
    }

    @PluginMethod
    public void setAuto(PluginCall call) {
        auto = Boolean.TRUE.equals(call.getBoolean("on", false));
        Activity a = getActivity();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && supported(a)) {
            a.runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) a.setPictureInPictureParams(params());
                } catch (Exception ignored) {
                }
            });
        }
        call.resolve();
    }

    void changed(boolean inPip) {
        JSObject r = new JSObject();
        r.put("inPip", inPip);
        notifyListeners("pipChange", r);
    }
}
