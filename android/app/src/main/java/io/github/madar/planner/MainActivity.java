package io.github.madar.planner;

import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PipPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** leaving the app with a timer running: shrink into the floating window (Android 12+ does this itself) */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (PipPlugin.auto && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) PipPlugin.enter(this);
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration newConfig) {
        super.onPictureInPictureModeChanged(inPip, newConfig);
        PluginHandle h = getBridge() == null ? null : getBridge().getPlugin("MadarPip");
        if (h != null && h.getInstance() instanceof PipPlugin) ((PipPlugin) h.getInstance()).changed(inPip);
    }
}
