package io.github.ayva.tv;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Keeps the app up to date from GitHub Releases, like the desktop app: looks
 * for a newer Ayva-Android.apk now and then, and on request downloads it and
 * hands it to Android's installer. Android shows its own install prompt, and
 * only accepts an APK signed with the same key as the installed app.
 */
class Updater {

    interface Listener {
        /** Called on the main thread whenever {@link #state()} changes. */
        void onUpdateState();
    }

    enum State { IDLE, CHECKING, UP_TO_DATE, AVAILABLE, DOWNLOADING, INSTALLING, FAILED }

    private static final String LATEST = "https://api.github.com/repos/Eilidhel/ayva/releases/latest";
    private static final String ASSET = "Ayva-Android.apk";
    private static final long CHECK_EVERY_MS = 6 * 60 * 60 * 1000L;

    private final Activity activity;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private State state = State.IDLE;
    private int progress; // percent while downloading

    Updater(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        // A release found earlier counts until it is installed.
        if (latestCode() > installedCode()) state = State.AVAILABLE;
    }

    State state() { return state; }

    int progress() { return progress; }

    String installedVersion() {
        PackageInfo info = packageInfo();
        return info == null ? "?" : info.versionName;
    }

    String latestVersion() {
        return prefs().getString("version", "");
    }

    /** Back on screen: an install that was cancelled or failed can be tried again. */
    void resume() {
        if (state == State.INSTALLING && latestCode() > installedCode()) set(State.AVAILABLE);
    }

    /** Looks for a new release, at most every few hours unless forced. */
    void check(boolean force) {
        if (state == State.CHECKING || state == State.DOWNLOADING || state == State.INSTALLING) return;
        long last = prefs().getLong("checkedAt", 0);
        if (!force && System.currentTimeMillis() - last < CHECK_EVERY_MS) return;
        set(State.CHECKING);
        new Thread(() -> {
            try {
                JSONObject release = new JSONObject(readText(LATEST));
                String version = release.getString("tag_name").replaceFirst("^v", "");
                String url = null;
                JSONArray assets = release.getJSONArray("assets");
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject a = assets.getJSONObject(i);
                    if (ASSET.equals(a.getString("name"))) url = a.getString("browser_download_url");
                }
                SharedPreferences.Editor edit = prefs().edit().putLong("checkedAt", System.currentTimeMillis());
                if (url != null) edit.putString("version", version).putString("url", url);
                edit.apply();
                post(latestCode() > installedCode() ? State.AVAILABLE : State.UP_TO_DATE);
            } catch (Exception e) {
                post(latestCode() > installedCode() ? State.AVAILABLE : State.FAILED);
            }
        }).start();
    }

    /** Downloads the new APK and starts Android's installer. */
    void install() {
        if (state != State.AVAILABLE) return;
        String url = prefs().getString("url", null);
        if (url == null || latestCode() <= installedCode()) return;
        // Android 8+ asks once whether Ayva may install apps.
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())));
                return;
            } catch (Exception e) {
                // Some TVs have no such screen; the installer asks instead.
            }
        }
        progress = 0;
        set(State.DOWNLOADING);
        new Thread(() -> {
            File apk = new File(activity.getCacheDir(), "update.apk");
            try {
                download(url, apk);
                // Only something newer of this very app goes to the installer.
                PackageInfo info = activity.getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
                if (info == null || !activity.getPackageName().equals(info.packageName)
                        || info.versionCode <= installedCode()) {
                    throw new Exception("not a newer Ayva");
                }
                post(State.INSTALLING);
                startInstall(apk);
            } catch (Exception e) {
                apk.delete();
                main.post(() -> {
                    Toast.makeText(activity, R.string.update_failed, Toast.LENGTH_LONG).show();
                    set(State.AVAILABLE);
                });
            }
        }).start();
    }

    private void startInstall(File apk) throws Exception {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(apk);
                 OutputStream out = session.openWrite("ayva.apk", 0, apk.length())) {
                copy(in, out, -1);
                session.fsync(out);
            }
            Intent done = new Intent(activity, UpdateReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(activity, id, done, flags).getIntentSender());
        }
        apk.delete();
    }

    private void download(String url, File to) throws Exception {
        HttpURLConnection c = open(url);
        long total = c.getContentLength();
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(to)) {
            copy(in, out, total);
        } finally {
            c.disconnect();
        }
    }

    private void copy(InputStream in, OutputStream out, long total) throws Exception {
        byte[] buf = new byte[64 * 1024];
        long done = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            done += n;
            if (total > 0) {
                final int pct = (int) (done * 100 / total);
                if (pct != progress) main.post(() -> {
                    progress = pct;
                    listener.onUpdateState();
                });
            }
        }
    }

    private static String readText(String url) throws Exception {
        HttpURLConnection c = open(url);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "Ayva-Android");
        c.setInstanceFollowRedirects(true);
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        return c;
    }

    private void post(State s) {
        main.post(() -> set(s));
    }

    private void set(State s) {
        state = s;
        listener.onUpdateState();
    }

    private int latestCode() {
        return versionCode(latestVersion());
    }

    @SuppressWarnings("deprecation")
    private int installedCode() {
        PackageInfo info = packageInfo();
        return info == null ? Integer.MAX_VALUE : info.versionCode;
    }

    private PackageInfo packageInfo() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    // "0.8.1" -> 801, the same rule as versionCode in build.gradle.
    static int versionCode(String version) {
        int code = 0;
        for (String part : version.split("\\.")) {
            try {
                code = code * 100 + Integer.parseInt(part.replaceAll("\\D.*$", ""));
            } catch (NumberFormatException e) {
                return 0;
            }
        }
        return code;
    }

    private SharedPreferences prefs() {
        return activity.getSharedPreferences("update", Context.MODE_PRIVATE);
    }
}
