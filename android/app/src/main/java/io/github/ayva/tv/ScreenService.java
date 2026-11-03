package io.github.ayva.tv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.net.wifi.WifiManager;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.PowerManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Display;

/**
 * Shows this phone's screen on the computer. Android only allows screen
 * capture from a foreground service, with a notification (its Stop button
 * ends it). The picture is encoded by ScreenEncoder and handed to the sink,
 * which PlayerActivity passes on to the page; the page sends it to the
 * computer over a WebRTC data channel.
 */
public class ScreenService extends Service {

    interface Sink {
        void frame(byte[] data); // from the encoder's thread

        // "on"; "off:<why>" (notification, locked, system or app) or "failed";
        // "sound:pc-failed" when the sound can't play on the computer only;
        // "screen:off" / "screen:on" when the phone's screen turns off or on
        void state(String state);
    }

    static final String EXTRA_RESULT = "result";
    static final String EXTRA_DATA = "data";
    private static final String ACTION_STOP = "io.github.ayva.tv.STOP_SCREEN";
    private static final String CHANNEL = "screen";
    private static final int NOTIFICATION_ID = 7;

    // Long side of the picture sent; the phone's screen is scaled down to it.
    private static final int MAX_SIDE = 1280;
    static final int START_BITRATE = 6_000_000;

    static volatile Sink sink;
    private static volatile ScreenService current; // the capture in progress

    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaProjection projection;
    private VirtualDisplay display;
    private ScreenEncoder encoder;
    private DisplayManager.DisplayListener rotation;
    private int width, height;
    private int bitrate = START_BITRATE;
    private boolean failed;
    private String stopReason; // set by whoever ends it first
    private WifiManager.WifiLock wifiLock, wifiLatencyLock;
    private ScreenAudio audio; // null below Android 10, or without the microphone permission
    private PowerManager.WakeLock screenLock;
    private BroadcastReceiver screenOff;
    private volatile boolean screenWentOff;
    private boolean mutedHere; // this phone's media volume at zero while the sound plays on the computer
    private int savedVolume = -1; // ...and what it was before
    private boolean soundOnlyHereFails; // zero volume silenced the capture too on this phone

    static boolean isRunning() {
        return current != null;
    }

    // ---- Why the last capture ended ----
    // Kept on the phone, so that if Android closes Ayva while it shows the
    // screen (which leaves no chance to say so), the next start can tell:
    // "running" was never replaced. PlayerActivity shows it and clears it.

    private static final String NOTES = "screen";

    static void note(Context c, String what) {
        c.getSharedPreferences(NOTES, MODE_PRIVATE).edit().putString("last", what).commit();
    }

    // Only replaces "running": a reason noted first (the page's process ended) wins.
    private void noteEnd(String what) {
        String last = getSharedPreferences(NOTES, MODE_PRIVATE).getString("last", null);
        if ("running".equals(last)) note(this, what);
    }

    static String takeNote(Context c) {
        android.content.SharedPreferences p = c.getSharedPreferences(NOTES, MODE_PRIVATE);
        String last = p.getString("last", null);
        if (last != null && !(last.equals("running") && isRunning())) p.edit().remove("last").apply();
        return last;
    }

    // The sound plays on the computer; on this phone too, or not.
    static void setPhoneSound(boolean play) {
        ScreenService s = current;
        if (s != null) s.main.post(() -> s.mutePhone(!play));
    }

    // For the computer's numbers: pictures the encoder made since it last asked.
    static int encodedFrames() {
        return ScreenEncoder.encoded.getAndSet(0);
    }

    // For the computer's numbers: the captured sound's loudest moment lately.
    static String soundLevel() {
        ScreenService s = current;
        ScreenAudio a = s == null ? null : s.audio;
        return a == null ? "none" : String.valueOf(a.peakDb());
    }

    static void requestKeyFrame() {
        ScreenService s = current;
        ScreenEncoder e = s == null ? null : s.encoder;
        if (e != null) e.requestKeyFrame();
    }

    static void setBitrate(int bitrate) {
        ScreenService s = current;
        if (s == null) return;
        s.bitrate = bitrate;
        ScreenEncoder e = s.encoder;
        if (e != null) e.setBitrate(bitrate);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // Text in the language chosen in Settings (Lang), not the phone's.
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Lang.wrap(base));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction()) || projection != null) {
            if (intent == null || ACTION_STOP.equals(intent.getAction())) {
                if (stopReason == null) stopReason = "notification";
                stopSelf();
            }
            return START_NOT_STICKY;
        }
        // Android 14 wants the foreground service running before the capture starts.
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification());
        }
        try {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            Intent data = intent.getParcelableExtra(EXTRA_DATA);
            projection = mpm.getMediaProjection(intent.getIntExtra(EXTRA_RESULT, 0), data);
            if (projection == null) throw new IllegalStateException("no projection");
            // Ended from outside: the system's own stop button, or another app capturing.
            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    if (stopReason == null) stopReason = screenWentOff ? "locked" : "system";
                    stopSelf();
                }
            }, main);
            current = this;
            startCapture();
            startAudio();
            holdWifi();
            keepScreenOn();
            note(this, "running");
            tell("on");
        } catch (Exception e) {
            fail();
        }
        return START_NOT_STICKY;
    }

    private void startCapture() throws Exception {
        DisplayMetrics m = metrics();
        pickSize(m);
        encoder = newEncoder();
        display = projection.createVirtualDisplay("Ayva", width, height, m.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, encoder.surface(), null, main);
        // Turning the phone swaps the sides: the encoder starts over at the new size.
        DisplayManager dm = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        rotation = new DisplayManager.DisplayListener() {
            @Override
            public void onDisplayAdded(int id) {
            }

            @Override
            public void onDisplayRemoved(int id) {
            }

            @Override
            public void onDisplayChanged(int id) {
                if (id == Display.DEFAULT_DISPLAY) resize();
            }
        };
        dm.registerDisplayListener(rotation, main);
    }

    private void resize() {
        if (display == null) return;
        DisplayMetrics m = metrics();
        int oldW = width, oldH = height;
        pickSize(m);
        if (width == oldW && height == oldH) return;
        display.setSurface(null);
        if (encoder != null) encoder.stop();
        encoder = null;
        try {
            encoder = newEncoder();
        } catch (Exception e) {
            fail();
            return;
        }
        display.resize(width, height, m.densityDpi);
        display.setSurface(encoder.surface());
    }

    private ScreenEncoder newEncoder() throws Exception {
        return new ScreenEncoder(width, height, bitrate, new ScreenEncoder.Output() {
            @Override
            public void frame(byte[] data) {
                Sink s = sink;
                if (s != null) s.frame(data);
            }

            @Override
            public void failed() {
                main.post(ScreenService.this::fail);
            }
        });
    }

    @SuppressWarnings("deprecation")
    private DisplayMetrics metrics() {
        DisplayMetrics m = new DisplayMetrics();
        DisplayManager dm = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
        dm.getDisplay(Display.DEFAULT_DISPLAY).getRealMetrics(m);
        return m;
    }

    // Scaled so the long side is at most MAX_SIDE; encoders want multiples of 16.
    private void pickSize(DisplayMetrics m) {
        float scale = Math.min(1f, (float) MAX_SIDE / Math.max(m.widthPixels, m.heightPixels));
        width = Math.max(16, Math.round(m.widthPixels * scale / 16f) * 16);
        height = Math.max(16, Math.round(m.heightPixels * scale / 16f) * 16);
    }

    private void startAudio() {
        if (Build.VERSION.SDK_INT < 29
                || checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        try {
            audio = new ScreenAudio(projection, new ScreenEncoder.Output() {
                @Override
                public void frame(byte[] data) {
                    Sink s = sink;
                    if (s != null) s.frame(data);
                }

                @Override
                public void failed() {
                }
            });
        } catch (Exception e) {
            audio = null; // the picture still goes, without sound
        }
    }

    // Android ends a screen capture when the phone locks, and the screen
    // turns off by itself after a minute or two without a touch. While the
    // screen is shown on the computer, it stays on (and noting when it went
    // off anyway tells the computer why the capture ended).
    @SuppressWarnings("deprecation")
    private void keepScreenOn() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        try {
            screenLock = pm.newWakeLock(PowerManager.SCREEN_DIM_WAKE_LOCK, "Ayva:screen-shown");
            screenLock.setReferenceCounted(false);
            screenLock.acquire();
        } catch (Exception e) {
            screenLock = null;
        }
        // Some phones ignore that lock and turn the screen off anyway: the
        // picture then stops (and most apps pause their sound). The computer
        // is told, so it can say so instead of looking frozen.
        screenOff = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                boolean off = Intent.ACTION_SCREEN_OFF.equals(intent.getAction());
                if (off) screenWentOff = true;
                tell(off ? "screen:off" : "screen:on");
            }
        };
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_OFF);
        f.addAction(Intent.ACTION_SCREEN_ON);
        registerReceiver(screenOff, f);
    }

    // "Computer only": the phone's media volume goes to zero and back
    // afterwards. Android's mute switch also silences what is captured, so
    // the volume is turned down instead; volume is kept per output, and on
    // many phones the capture keeps its own. Where it doesn't (an app plays
    // but nothing is captured for a few seconds), the volume comes back and
    // the computer is told, so the sound plays on both.
    private void mutePhone(boolean mute) {
        if (mute == mutedHere || (mute && soundOnlyHereFails)) return;
        AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        try {
            if (mute) {
                savedVolume = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0);
                mutedHere = true;
                silentWhilePlaying = 0;
                main.postDelayed(watchCapture, 1500);
            } else {
                main.removeCallbacks(watchCapture);
                if (savedVolume >= 0 && am.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) {
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, savedVolume, 0);
                }
                mutedHere = false;
            }
        } catch (Exception ignored) {
        }
    }

    private int silentWhilePlaying; // seconds in a row
    private final Runnable watchCapture = new Runnable() {
        @Override
        public void run() {
            if (!mutedHere || audio == null) return;
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am.isMusicActive() && audio.recentDb() < -80) silentWhilePlaying++;
            else silentWhilePlaying = 0;
            if (silentWhilePlaying >= 3) {
                soundOnlyHereFails = true;
                mutePhone(false);
                tell("sound:pc-failed");
                return;
            }
            main.postDelayed(this, 1000);
        }
    };

    // Wi-Fi power saving holds packets back for a beacon interval or more,
    // which shows as stutter; kept off while the screen is shown.
    @SuppressWarnings("deprecation")
    private void holdWifi() {
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null) return;
        // Low latency counts only while Ayva is on screen; high performance
        // still holds while the user is in another app.
        wifiLock = lock(wm, WifiManager.WIFI_MODE_FULL_HIGH_PERF);
        if (Build.VERSION.SDK_INT >= 29) wifiLatencyLock = lock(wm, WifiManager.WIFI_MODE_FULL_LOW_LATENCY);
    }

    private static WifiManager.WifiLock lock(WifiManager wm, int mode) {
        try {
            WifiManager.WifiLock l = wm.createWifiLock(mode, "Ayva:screen");
            l.setReferenceCounted(false);
            l.acquire();
            return l;
        } catch (Exception e) {
            return null;
        }
    }

    private void fail() {
        failed = true;
        if (stopReason == null) stopReason = "failed";
        stopSelf();
    }

    private void tell(String state) {
        Sink s = sink;
        if (s != null) s.state(state);
    }

    @SuppressWarnings("deprecation")
    private Notification notification() {
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL,
                    getString(R.string.screen_channel), NotificationManager.IMPORTANCE_LOW));
            b = new Notification.Builder(this, CHANNEL);
        } else {
            b = new Notification.Builder(this);
        }
        int immutable = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent stop = PendingIntent.getService(this, 0,
                new Intent(this, ScreenService.class).setAction(ACTION_STOP),
                immutable | PendingIntent.FLAG_UPDATE_CURRENT);
        return b.setSmallIcon(android.R.drawable.ic_menu_share)
                .setContentTitle(getString(R.string.screen_on))
                .setContentText(getString(R.string.screen_on_text))
                .setOngoing(true)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, getString(R.string.screen_stop), stop)
                .build();
    }

    @Override
    public void onDestroy() {
        if (stopReason == null) stopReason = "app"; // stopped by the page or the player
        mutePhone(false);
        if (audio != null) audio.stop();
        audio = null;
        if (screenLock != null && screenLock.isHeld()) screenLock.release();
        screenLock = null;
        if (screenOff != null) unregisterReceiver(screenOff);
        screenOff = null;
        for (WifiManager.WifiLock l : new WifiManager.WifiLock[]{wifiLock, wifiLatencyLock}) {
            if (l != null && l.isHeld()) l.release();
        }
        wifiLock = null;
        wifiLatencyLock = null;
        if (rotation != null) {
            ((DisplayManager) getSystemService(Context.DISPLAY_SERVICE)).unregisterDisplayListener(rotation);
        }
        if (display != null) display.release();
        display = null;
        if (encoder != null) encoder.stop();
        encoder = null;
        if (projection != null) projection.stop();
        projection = null;
        if (current == this) current = null;
        noteEnd(failed ? "failed" : stopReason);
        tell(failed ? "failed" : "off:" + stopReason);
        super.onDestroy();
    }
}
