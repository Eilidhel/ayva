package io.github.ayva.tv;

import android.app.Activity;
import android.content.pm.PackageInfo;

/**
 * The Google Play build's stand-in for the GitHub build's updater (src/github).
 * Play allows an app to be updated only through Play, so this one never looks
 * for, downloads or installs anything; it only tells the installed version.
 */
class Updater {

    /** Whether this build updates itself (Settings shows the check). */
    static final boolean ENABLED = false;

    interface Listener {
        void onUpdateState();
    }

    enum State { IDLE, CHECKING, UP_TO_DATE, AVAILABLE, DOWNLOADING, INSTALLING, FAILED }

    private final Activity activity;

    Updater(Activity activity, Listener listener) {
        this.activity = activity;
    }

    State state() { return State.IDLE; }

    int progress() { return 0; }

    String installedVersion() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return info.versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    String latestVersion() { return ""; }

    void resume() { }

    void check(boolean force) { }

    void install() { }
}
