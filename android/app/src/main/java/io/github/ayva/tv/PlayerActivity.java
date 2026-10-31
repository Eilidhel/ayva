package io.github.ayva.tv;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;

import java.util.ArrayList;
import java.util.List;

/**
 * Full-screen player. Shows the computer's watch page, which receives the
 * WebRTC stream; Back returns to the computer list. On phones it also lends
 * the page what a browser would: the microphone, a file picker, Downloads,
 * and the device key (DeviceKey) kept in the Android Keystore.
 */
public class PlayerActivity extends Activity {

    static final String EXTRA_URL = "url";

    private static final int REQUEST_MIC = 1;
    private static final int REQUEST_FILES = 2;

    private WebView web;
    private TextView problems; // what failed to load, for troubleshooting
    private final List<String> problemLines = new ArrayList<>();
    private String origin; // the computer's address; the page may not leave it
    private volatile String currentOrigin;
    private PermissionRequest pendingMic;
    private ValueCallback<Uri[]> pendingFiles;
    private SplitProxy proxy; // only for the fixed address

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String url = getIntent().getStringExtra(EXTRA_URL);
        origin = originOf(url);
        currentOrigin = origin;

        web = new WebView(this);
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
        });
        web.setWebChromeClient(new Chrome());
        if (DeviceKey.supported()) {
            web.addJavascriptInterface(new DeviceKey(
                    () -> origin != null && origin.equals(currentOrigin) ? origin : null), "AyvaKey");
        }
        web.addJavascriptInterface(new FileSaver(this), "AyvaFiles");
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

        // The fixed address goes through SplitProxy, past networks that block workers.dev.
        String host = Uri.parse(url).getHost();
        if (host != null && host.endsWith(".workers.dev")
                && WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            try {
                proxy = new SplitProxy(host);
                int port = proxy.start();
                ProxyController.getInstance().setProxyOverride(
                        new ProxyConfig.Builder().addProxyRule("127.0.0.1:" + port).build(),
                        Runnable::run, () -> web.loadUrl(url));
                return;
            } catch (Exception e) {
                if (proxy != null) proxy.stop();
                proxy = null;
            }
        }
        web.loadUrl(url);
    }

    // Only the path: links may carry an access key, which must not end up in a screenshot.
    private static String pathOf(Uri u) {
        return u == null ? "?" : (u.getPath() == null || u.getPath().isEmpty() ? "/" : u.getPath());
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

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                boolean wantsMic = false;
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
                }
                if (!wantsMic || !originOf(request.getOrigin().toString()).equals(origin)) {
                    request.deny();
                    return;
                }
                if (Build.VERSION.SDK_INT < 23
                        || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    pendingMic = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
                }
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
        if (requestCode != REQUEST_MIC || pendingMic == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingMic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingMic.deny();
        }
        pendingMic = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
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

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
        }
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
