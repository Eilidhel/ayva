package io.github.ayva.tv;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Full-screen player. Shows the computer's watch page, which receives the
 * WebRTC stream; Back returns to the computer list. On phones it also lends
 * the page what a browser would: the microphone, a file picker, Downloads,
 * the device key (DeviceKey) kept in the Android Keystore, and the phone's
 * own screen (ScreenService), which the page can show on the computer.
 */
public class PlayerActivity extends Activity {

    static final String EXTRA_URL = "url";

    private static final int REQUEST_MIC = 1;
    private static final int REQUEST_FILES = 2;
    private static final int REQUEST_SCREEN = 3;
    private static final int REQUEST_NOTIFY = 4;
    // Encoded pictures waiting for the page; past this many it has fallen
    // behind, and pictures are skipped until the next key frame.
    private static final int SCREEN_MAX_QUEUED = 10;

    private WebView web;
    private TextView problems; // what failed to load, for troubleshooting
    private final List<String> problemLines = new ArrayList<>();
    private String origin; // the computer's address; the page may not leave it
    private volatile String currentOrigin;
    private PermissionRequest pendingMic;
    private ValueCallback<Uri[]> pendingFiles;
    private SplitProxy proxy; // only for the fixed address
    private LocalForward forward; // only on the home network
    private String proofOrigin; // the computer's real address, named in device proofs
    private MediaModeKeeper mediaMode;
    private boolean micUsed; // the page has had the microphone
    private final Handler main = new Handler(Looper.getMainLooper());
    private JavaScriptReplyProxy screenReply; // the page's AyvaScreen object, to answer it
    private final AtomicInteger screenQueued = new AtomicInteger();
    private final AtomicInteger screenSkipped = new AtomicInteger(); // since the page last asked
    private boolean screenSkipping; // encoder thread only
    private ScreenService.Sink screenSink;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String asked = getIntent().getStringExtra(EXTRA_URL);
        proofOrigin = originOf(asked);
        // On the home network the page is plain http, where WebView allows no
        // microphone; through LocalForward it is http://127.0.0.1, which counts
        // as secure. Proofs still name the computer's real address.
        String url = asked;
        Uri target = asked == null ? null : Uri.parse(asked);
        if (target != null && "http".equals(target.getScheme()) && target.getHost() != null
                && !"127.0.0.1".equals(target.getHost()) && !"localhost".equals(target.getHost())) {
            try {
                forward = new LocalForward(target.getHost(), target.getPort() == -1 ? 80 : target.getPort());
                url = target.buildUpon().encodedAuthority("127.0.0.1:" + forward.start()).build().toString();
            } catch (Exception e) {
                if (forward != null) forward.stop();
                forward = null;
            }
        }
        final String pageUrl = url;
        origin = originOf(pageUrl);
        currentOrigin = origin;

        mediaMode = new MediaModeKeeper(this);
        // Test builds only (-PnameSuffix=-test.N): the page can be inspected
        // over ADB (chrome://inspect), to see what it does while it is out of sight.
        if (isTestBuild()) WebView.setWebContentsDebuggingEnabled(true);
        web = new PageView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Lets the stream start with sound, without pressing a button first.
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if (origin != null && origin.equals(originOf(target.toString()))) return false;
                // Anything else (a link in a received text, say) opens in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, target));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String u, boolean isReload) {
                currentOrigin = originOf(u);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                problem(pathOf(request.getUrl()) + ": " + error.getDescription());
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                problem(pathOf(request.getUrl()) + ": HTTP " + response.getStatusCode());
            }

            // Android ended the page's process (memory): back to the computer
            // list instead of the whole app crashing.
            @Override
            public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                if (ScreenService.isRunning()) {
                    ScreenService.note(PlayerActivity.this, detail.didCrash() ? "page-crashed" : "page-closed");
                }
                if (view == web) {
                    ((FrameLayout) web.getParent()).removeView(web);
                    web.destroy();
                    web = null;
                }
                finish();
                return true;
            }
        });
        web.setWebChromeClient(new Chrome());
        if (DeviceKey.supported()) {
            web.addJavascriptInterface(new DeviceKey(
                    () -> origin != null && origin.equals(currentOrigin) ? proofOrigin : null), "AyvaKey");
        }
        web.addJavascriptInterface(new FileSaver(this), "AyvaFiles");
        addScreenBridge();
        FrameLayout root = new FrameLayout(this);
        root.addView(web);
        problems = new TextView(this);
        problems.setTextColor(Color.WHITE);
        problems.setBackgroundColor(0xCC5A1A1A);
        problems.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        int pad = Math.round(12 * getResources().getDisplayMetrics().density);
        problems.setPadding(pad, pad * 3, pad, pad);
        problems.setVisibility(View.GONE);
        problems.setOnClickListener(v -> v.setVisibility(View.GONE));
        root.addView(problems, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        setContentView(root);
        hideSystemUi();
        showLastScreenEnd();

        // The fixed address goes through SplitProxy, past networks that block workers.dev.
        String host = Uri.parse(url).getHost();
        if (host != null && host.endsWith(".workers.dev")
                && WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            try {
                proxy = new SplitProxy(host);
                int port = proxy.start();
                ProxyController.getInstance().setProxyOverride(
                        new ProxyConfig.Builder().addProxyRule("127.0.0.1:" + port).build(),
                        Runnable::run, () -> web.loadUrl(pageUrl));
                return;
            } catch (Exception e) {
                if (proxy != null) proxy.stop();
                proxy = null;
            }
        }
        web.loadUrl(pageUrl);
    }

    // Only the path: links may carry an access key, which must not end up in a screenshot.
    private static String pathOf(Uri u) {
        return u == null ? "?" : (u.getPath() == null || u.getPath().isEmpty() ? "/" : u.getPath());
    }

    // Showing the screen ended last time without the user stopping it: say
    // why at the top, until tapped away (see ScreenService.note).
    private void showLastScreenEnd() {
        String last = ScreenService.takeNote(this);
        int text;
        if ("running".equals(last) && !ScreenService.isRunning()) text = R.string.screen_end_killed;
        else if ("page-closed".equals(last) || "page-crashed".equals(last)) text = R.string.screen_end_page;
        else if ("system".equals(last)) text = R.string.screen_end_system;
        else if ("locked".equals(last)) text = R.string.screen_end_locked;
        else if ("failed".equals(last)) text = R.string.screen_end_failed;
        else return;
        problems.setText(getString(text) + " (" + Build.MANUFACTURER + " " + Build.MODEL + ", Android " + Build.VERSION.RELEASE + ")");
        problems.setVisibility(View.VISIBLE);
    }

    // Shown on top of the page until tapped away, so a screenshot says what went wrong.
    private void problem(String line) {
        runOnUiThread(() -> {
            if (problemLines.size() >= 6 || problemLines.contains(line)) return;
            problemLines.add(line);
            problems.setText(getString(R.string.load_problems) + "\n" + android.text.TextUtils.join("\n", problemLines));
            problems.setVisibility(View.VISIBLE);
        });
    }

    private static String originOf(String url) {
        if (url == null) return null;
        Uri u = Uri.parse(url);
        if (u.getScheme() == null || u.getHost() == null) return null;
        return u.getScheme() + "://" + u.getHost() + (u.getPort() == -1 ? "" : ":" + u.getPort());
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                String text = m.message().replaceAll("https?://[^\\s/]+", "").replaceAll("\\?\\S*", "");
                problem("JS: " + (text.length() > 140 ? text.substring(0, 140) + "…" : text)
                        + " (" + pathOf(Uri.parse(m.sourceId())) + ":" + m.lineNumber() + ")");
            }
            return false;
        }

        // Without this, WebView draws a grey Android logo on the video before it plays.
        @Override
        public Bitmap getDefaultVideoPoster() {
            return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        }

        // The microphone ("Talk") and the camera ("Show my camera"), only for
        // the computer's own page; Android is asked first when needed.
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                List<String> wanted = new ArrayList<>();
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)
                            || PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wanted.add(r);
                }
                if (wanted.isEmpty() || !originOf(request.getOrigin().toString()).equals(origin)) {
                    request.deny();
                    return;
                }
                if (pendingMic != null) pendingMic.deny();
                pendingMic = request;
                List<String> missing = new ArrayList<>();
                for (String r : wanted) {
                    String p = androidPermission(r);
                    if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) {
                        missing.add(p);
                    }
                }
                if (missing.isEmpty()) answerPageRequest();
                else requestPermissions(missing.toArray(new String[0]), REQUEST_MIC);
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
                startActivityForResult(Intent.createChooser(pick, null), REQUEST_FILES);
            } catch (Exception e) {
                pendingFiles = null;
                return false;
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        // Without notifications the capture still works; Android just hides its Stop button.
        if (requestCode == REQUEST_NOTIFY) {
            askScreen();
            return;
        }
        if (requestCode != REQUEST_MIC || pendingMic == null) return;
        answerPageRequest();
    }

    private static String androidPermission(String resource) {
        return PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                ? Manifest.permission.CAMERA : Manifest.permission.RECORD_AUDIO;
    }

    // Grants the page what Android allows; refused if any of it is not.
    private void answerPageRequest() {
        PermissionRequest request = pendingMic;
        pendingMic = null;
        if (request == null) return;
        List<String> granted = new ArrayList<>();
        for (String r : request.getResources()) {
            if (!PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) continue;
            if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(androidPermission(r)) != PackageManager.PERMISSION_GRANTED) {
                request.deny();
                return;
            }
            granted.add(r);
        }
        request.grant(granted.toArray(new String[0]));
        if (granted.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) micStarted();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQUEST_SCREEN) {
            screenAllowed(resultCode, data);
            return;
        }
        if (requestCode != REQUEST_FILES || pendingFiles == null) return;
        Uri[] picked = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                picked = new Uri[data.getClipData().getItemCount()];
                for (int i = 0; i < picked.length; i++) picked[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                picked = new Uri[]{data.getData()};
            }
        }
        pendingFiles.onReceiveValue(picked);
        pendingFiles = null;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void micStarted() {
        micUsed = true;
        mediaMode.start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (micUsed) mediaMode.start();
    }

    @Override
    protected void onPause() {
        super.onPause();
        mediaMode.stop();
    }

    // ---- The phone's screen on the computer ----
    // The page gets an AyvaScreen object (only on this computer's address, in
    // the main frame) and posts "start", "stop", "key" (send a key frame now)
    // or "bitrate:<bits per second>". It gets back "on", "off", "denied" or
    // "failed", and each encoded picture as an ArrayBuffer (see ScreenEncoder).

    private void addScreenBridge() {
        if (isTv() || origin == null
                || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)) {
            return;
        }
        WebViewCompat.addWebMessageListener(web, "AyvaScreen", Collections.singleton(origin),
                (view, message, sourceOrigin, isMainFrame, reply) -> {
                    if (!isMainFrame || message.getType() != WebMessageCompat.TYPE_STRING) return;
                    String cmd = message.getData();
                    if (cmd == null) return;
                    screenReply = reply;
                    if (cmd.equals("start")) startScreen();
                    else if (cmd.equals("stop")) stopService(new Intent(this, ScreenService.class));
                    else if (cmd.equals("key")) ScreenService.requestKeyFrame();
                    else if (cmd.equals("stats")) {
                        reply.postMessage("stats:" + screenSkipped.getAndSet(0) + "," + ScreenService.soundLevel()
                                + "," + ScreenService.encodedFrames());
                    }
                    else if (cmd.equals("debug")) {
                        // Test builds: what the computer reads over ADB when the picture stops.
                        reply.postMessage("debug:queued=" + screenQueued.get() + " skipping=" + screenSkipping
                                + " service=" + ScreenService.isRunning());
                    }
                    else if (cmd.equals("sound:pc")) ScreenService.setPhoneSound(false);
                    else if (cmd.equals("sound:both")) ScreenService.setPhoneSound(true);
                    else if (cmd.equals("battery?")) reply.postMessage(batteryLimited() ? "battery:limited" : "battery:ok");
                    else if (cmd.equals("battery-settings")) openAppSettings();
                    else if (cmd.startsWith("bitrate:")) {
                        try {
                            int bps = Integer.parseInt(cmd.substring(8));
                            ScreenService.setBitrate(Math.max(300_000, Math.min(bps, 12_000_000)));
                        } catch (NumberFormatException ignored) {
                        }
                    }
                });
        screenSink = new ScreenService.Sink() {
            @Override
            public void frame(byte[] data) {
                // Sound (from ScreenAudio's own thread) is small and never waits for a key frame.
                if ((data[0] & 8) != 0) {
                    if (screenQueued.get() > SCREEN_MAX_QUEUED * 3) return;
                    screenQueued.incrementAndGet();
                    main.post(() -> {
                        screenQueued.decrementAndGet();
                        if (screenReply != null) screenReply.postMessage(data);
                    });
                    return;
                }
                boolean key = (data[0] & 1) != 0;
                if (screenQueued.get() > SCREEN_MAX_QUEUED) {
                    if (!screenSkipping) ScreenService.requestKeyFrame();
                    screenSkipping = true;
                    screenSkipped.incrementAndGet();
                    return;
                }
                if (screenSkipping && !key) {
                    screenSkipped.incrementAndGet();
                    return;
                }
                screenSkipping = false;
                screenQueued.incrementAndGet();
                main.post(() -> {
                    screenQueued.decrementAndGet();
                    if (screenReply != null) screenReply.postMessage(data);
                });
            }

            @Override
            public void state(String state) {
                // Only the capture starting or ending changes it, not news about the sound.
                if (!state.startsWith("sound:") && !state.startsWith("screen:")) {
                    main.post(() -> keepPageAlive(state.equals("on")));
                }
                screenEvent(state);
            }
        };
        ScreenService.sink = screenSink;
    }

    // The page sends the picture on, also while the user is in another app.
    // A WebView out of sight normally gives its page process a low priority,
    // and Android may end it under memory pressure; not while showing the screen.
    private void keepPageAlive(boolean on) {
        if (web == null) return;
        ((PageView) web).setKeepRunning(on);
        if (Build.VERSION.SDK_INT < 26) return;
        web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, !on);
    }

    // Chromium freezes a page about a minute after its window goes out of
    // sight: no timers, no messages, so the picture and sound stopped while
    // the user was in another app. While the screen is shown it is told the
    // window is still visible, which keeps the page running; only then.
    private static final class PageView extends WebView {
        private boolean keepRunning;

        PageView(Context context) {
            super(context);
        }

        void setKeepRunning(boolean on) {
            if (keepRunning == on) return;
            keepRunning = on;
            super.onWindowVisibilityChanged(on ? View.VISIBLE : getWindowVisibility());
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(keepRunning ? View.VISIBLE : visibility);
        }
    }

    private void screenEvent(String state) {
        main.post(() -> {
            if (screenReply != null) screenReply.postMessage(state);
        });
    }

    private void startScreen() {
        if (ScreenService.isRunning()) {
            screenEvent("on");
            return;
        }
        // Notifications (the Stop button) and, for the phone's sound, the
        // microphone permission, which Android requires for capturing what
        // apps play. Either may be refused: the picture still goes.
        List<String> missing = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (Build.VERSION.SDK_INT >= 29
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.RECORD_AUDIO);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), REQUEST_NOTIFY);
            return;
        }
        askScreen();
    }

    // Android's own "start recording or casting?" question, every time.
    private void askScreen() {
        try {
            MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            startActivityForResult(mpm.createScreenCaptureIntent(), REQUEST_SCREEN);
        } catch (Exception e) {
            screenEvent("failed");
        }
    }

    private void screenAllowed(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null) {
            screenEvent("denied");
            return;
        }
        Intent service = new Intent(this, ScreenService.class)
                .putExtra(ScreenService.EXTRA_RESULT, resultCode)
                .putExtra(ScreenService.EXTRA_DATA, data);
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(service);
            else startService(service);
        } catch (Exception e) {
            screenEvent("failed");
        }
    }

    // Battery saving may close Ayva while it is in the background, even
    // while showing the screen; "Unrestricted" battery use keeps it running.
    // Only checked and pointed to here: no permission is asked for.
    private boolean batteryLimited() {
        if (Build.VERSION.SDK_INT < 23) return false;
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
        boolean optimized = pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName());
        boolean restricted = false;
        if (Build.VERSION.SDK_INT >= 28) {
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            restricted = am != null && am.isBackgroundRestricted();
        }
        return optimized || restricted;
    }

    // Ayva's page in Settings, where battery use is set.
    private void openAppSettings() {
        try {
            startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
        }
    }

    private boolean isTestBuild() {
        try {
            String v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return v != null && v.contains("-test");
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private boolean isTv() {
        UiModeManager ui = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        return ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    @Override
    protected void onDestroy() {
        // The picture goes out through this page: without it there is nowhere to send it.
        if (screenSink != null && ScreenService.sink == screenSink) {
            ScreenService.sink = null;
            stopService(new Intent(this, ScreenService.class));
        }
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
        }
        if (forward != null) forward.stop();
        if (proxy != null) {
            proxy.stop();
            ProxyController.getInstance().clearProxyOverride(Runnable::run, () -> { });
        }
        super.onDestroy();
    }

    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 19) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }
}
