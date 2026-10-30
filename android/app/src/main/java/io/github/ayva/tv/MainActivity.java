package io.github.ayva.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.List;

/**
 * Start screen: lists the computers found on the network. Connects by itself
 * to the computer used last time, or to the only one found.
 */
public class MainActivity extends Activity implements Discovery.Listener {

    // Quince colours, same as the web pages (public/style.css).
    private static final int BG = 0xFF16130E;
    private static final int PANEL = 0xFF2C271D;
    private static final int ACCENT = 0xFFF2C14E;
    private static final int ON_ACCENT = 0xFF2A1D05;
    private static final int MUTED = 0xFFA89F8C;
    private static final int LIVE_BG = 0xFF3A2418;
    private static final long AUTO_CONNECT_WINDOW_MS = 4000;

    private Discovery discovery;
    private LinearLayout list;
    private TextView title;
    private TextView help;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long startedAt;
    private boolean autoConnect = true;
    private String focusedKey;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildLayout());
        discovery = new Discovery(this, this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        startedAt = System.currentTimeMillis();
        discovery.start();
        handler.postDelayed(this::showNotFoundHint, 8000);
    }

    @Override
    protected void onPause() {
        super.onPause();
        discovery.stop();
        handler.removeCallbacksAndMessages(null);
    }

    @Override
    public void onHostsChanged(List<Discovery.Host> hosts) {
        title.setText(hosts.isEmpty() ? R.string.searching : R.string.found);
        if (!hosts.isEmpty()) help.setText(R.string.help);

        if (autoConnect && maybeAutoConnect(hosts)) return;

        View focused = getCurrentFocus();
        if (focused != null && focused.getTag() instanceof String) focusedKey = (String) focused.getTag();

        list.removeAllViews();
        Button toFocus = null;
        for (Discovery.Host host : hosts) {
            Button b = hostButton(host);
            list.addView(b);
            if (toFocus == null || host.key().equals(focusedKey)) toFocus = b;
        }
        if (toFocus != null) toFocus.requestFocus();
    }

    private boolean maybeAutoConnect(List<Discovery.Host> hosts) {
        String last = prefs().getString("last", null);
        for (Discovery.Host host : hosts) {
            if (host.code != null && host.name.equals(last)) {
                open(host);
                return true;
            }
        }
        long elapsed = System.currentTimeMillis() - startedAt;
        if (elapsed > AUTO_CONNECT_WINDOW_MS) {
            autoConnect = false;
        } else if (hosts.size() == 1 && hosts.get(0).code != null && elapsed > 1500) {
            open(hosts.get(0));
            return true;
        }
        return false;
    }

    private void open(Discovery.Host host) {
        autoConnect = false;
        prefs().edit().putString("last", host.name).apply();
        Intent intent = new Intent(this, PlayerActivity.class);
        // The device name is what the computer shows when asking to let this TV in.
        intent.putExtra(PlayerActivity.EXTRA_URL,
                "http://" + host.address + ":" + host.port + "/watch.html?app=1&name="
                        + Uri.encode(deviceName()) + "#" + host.code);
        startActivity(intent);
    }

    private static String deviceName() {
        String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        String model = Build.MODEL == null ? "TV" : Build.MODEL;
        // Many models already start with the maker's name ("NEXT NEXT START 4K").
        if (!maker.isEmpty() && !model.toLowerCase().startsWith(maker.toLowerCase())) {
            model = Character.toUpperCase(maker.charAt(0)) + maker.substring(1) + " " + model;
        }
        return model;
    }

    private void showNotFoundHint() {
        if (list.getChildCount() == 0) help.setText(R.string.not_found);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("ayva", MODE_PRIVATE);
    }

    // ---- Views (built in code to keep the app dependency-free) ----

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(48), dp(40), dp(48), dp(24));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        header.addView(logo, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView name = text(getString(R.string.app_name), 30, Color.WHITE);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setPadding(dp(12), 0, 0, 0);
        header.addView(name);
        root.addView(header);

        title = text(getString(R.string.searching), 20, Color.WHITE);
        title.setPadding(0, dp(24), 0, dp(4));
        root.addView(title);

        help = text(getString(R.string.help), 15, MUTED);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, 0, 0, dp(16));
        root.addView(help);

        ScrollView scroll = new ScrollView(this);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);
        root.addView(scroll, new LinearLayout.LayoutParams(dp(520), LinearLayout.LayoutParams.WRAP_CONTENT));
        return root;
    }

    private Button hostButton(final Discovery.Host host) {
        Button b = new Button(this);
        b.setTag(host.key());
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        // Dark text on the gold focus highlight, light text otherwise.
        b.setTextColor(new ColorStateList(
                new int[][]{{android.R.attr.state_focused}, {android.R.attr.state_pressed}, {}},
                new int[]{ON_ACCENT, ON_ACCENT, Color.WHITE}));
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setPadding(dp(20), dp(16), dp(20), dp(16));
        String status = host.live ? "  ●  " + getString(R.string.live) : "  ·  " + getString(R.string.ready);
        b.setText(host.name + status);

        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_focused}, rounded(ACCENT));
        bg.addState(new int[]{android.R.attr.state_pressed}, rounded(ACCENT));
        bg.addState(new int[]{}, rounded(host.live ? LIVE_BG : PANEL));
        b.setBackground(bg);
        b.setFocusable(true);
        b.setOnClickListener(v -> open(host));

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    private GradientDrawable rounded(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(12));
        return d;
    }

    private TextView text(String s, int sp, int color) {
        TextView tv = new TextView(this);
        tv.setText(s);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        return tv;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
