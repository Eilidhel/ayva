package io.github.ayva.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.UiModeManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Start screen: lists the computers found on the network. Connects by itself
 * to the computer used last time, or to the only one found. On phones it also
 * keeps fixed addresses (https://ayva.<name>.workers.dev) for use away from home.
 * A newer app from GitHub Releases is offered at the top of the list.
 */
public class MainActivity extends Activity implements Discovery.Listener, Updater.Listener {

    // Quince colours, same as the web pages (public/style.css).
    private static final int BG = 0xFF16130E;
    private static final int PANEL = 0xFF2C271D;
    private static final int ACCENT = 0xFFF2C14E;
    private static final int ON_ACCENT = 0xFF2A1D05;
    private static final int MUTED = 0xFFA89F8C;
    private static final int LIVE_BG = 0xFF3A2418;
    private static final long AUTO_CONNECT_WINDOW_MS = 4000;

    private Discovery discovery;
    private Updater updater;
    private LinearLayout list;
    private TextView title;
    private TextView help;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long startedAt;
    private boolean autoConnect = true;
    private String focusedKey;
    private List<Discovery.Host> lastHosts = Collections.emptyList();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildLayout());
        discovery = new Discovery(this, this);
        updater = new Updater(this, this);
        render();
        handleLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleLink(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        startedAt = System.currentTimeMillis();
        discovery.start();
        handler.postDelayed(this::showNotFoundHint, 8000);
        updater.resume();
        updater.check(false);
    }

    @Override
    protected void onPause() {
        super.onPause();
        discovery.stop();
        handler.removeCallbacksAndMessages(null);
    }

    @Override
    public void onHostsChanged(List<Discovery.Host> hosts) {
        lastHosts = hosts;
        title.setText(hosts.isEmpty() ? R.string.searching : R.string.found);
        if (!hosts.isEmpty()) help.setText(isTv() ? R.string.help : R.string.help_phone);

        // With an update waiting, stay here so the update button can be seen.
        if (autoConnect && updater.state() != Updater.State.AVAILABLE && maybeAutoConnect(hosts)) return;
        render();
    }

    private void render() {
        View focused = getCurrentFocus();
        if (focused != null && focused.getTag() instanceof String) focusedKey = (String) focused.getTag();

        list.removeAllViews();
        Button toFocus = addUpdateButton();
        for (final Discovery.Host host : lastHosts) {
            String status = host.live ? "  ●  " + getString(R.string.live) : "  ·  " + getString(R.string.ready);
            Button b = hostButton(host.name + status, host.live, v -> open(host));
            b.setTag(host.key());
            list.addView(b);
            if (toFocus == null) toFocus = b;
        }
        if (!isTv()) addAddressButtons();
        list.addView(versionButton());
        View same = list.findViewWithTag(focusedKey);
        if (same != null) toFocus = (Button) same;
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
        // The device name is what the computer shows when asking to let this device in.
        startPlayer("http://" + host.address + ":" + host.port + "/watch.html?" + pageQuery() + "#" + host.code);
    }

    // A fixed address or internet link: the page there finds the computer.
    private void openUrl(String url) {
        autoConnect = false;
        Uri u = Uri.parse(url);
        String query = u.getEncodedQuery();
        startPlayer(u.buildUpon()
                .encodedQuery((query == null || query.isEmpty() ? "" : query + "&") + pageQuery())
                .build().toString());
    }

    private void startPlayer(String url) {
        Intent intent = new Intent(this, PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_URL, url);
        startActivity(intent);
    }

    // app=1 is the TV layout (made for the remote); phones get the touch page.
    private String pageQuery() {
        return (isTv() ? "app=1&" : "") + "name=" + Uri.encode(deviceName());
    }

    private boolean isTv() {
        UiModeManager ui = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
        return ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
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
        if (lastHosts.isEmpty()) help.setText(isTv() ? R.string.not_found : R.string.not_found_phone);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("ayva", MODE_PRIVATE);
    }

    // ---- Updates ----

    @Override
    public void onUpdateState() {
        render();
        if (updater.state() == Updater.State.UP_TO_DATE && checkAsked) {
            checkAsked = false;
            Toast.makeText(this, getString(R.string.version_latest, updater.installedVersion()), Toast.LENGTH_SHORT).show();
        }
    }

    private boolean checkAsked;

    // The update button, while there is something to show; null otherwise.
    private Button addUpdateButton() {
        String label;
        switch (updater.state()) {
            case AVAILABLE: label = getString(R.string.update_available, updater.latestVersion()); break;
            case DOWNLOADING: label = getString(R.string.update_downloading, updater.progress()); break;
            case INSTALLING: label = getString(R.string.update_installing); break;
            default: return null;
        }
        Button b = hostButton(label, true, v -> updater.install());
        b.setTag("update");
        list.addView(b);
        return b;
    }

    private Button versionButton() {
        String v = updater.installedVersion();
        int label;
        switch (updater.state()) {
            case CHECKING: label = R.string.version_checking; break;
            case UP_TO_DATE: label = R.string.version_latest; break;
            case FAILED: label = R.string.version_check_failed; break;
            default: label = R.string.version_check;
        }
        Button b = hostButton(getString(label, v), false, x -> {
            checkAsked = true;
            updater.check(true);
        });
        b.setTag("version");
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        return b;
    }

    // ---- Fixed addresses (phones) ----

    // An address opened with this app (from the camera, a message…): keep it and go there.
    private void handleLink(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"https".equals(data.getScheme()) || data.getHost() == null) return;
        if (data.getHost().endsWith(".workers.dev")) saveAddress(data);
        openUrl(data.toString());
    }

    private List<String> addresses() {
        List<String> out = new ArrayList<>();
        for (String a : prefs().getString("addresses", "").split("\n")) {
            if (!a.isEmpty()) out.add(a);
        }
        return out;
    }

    private void saveAddresses(List<String> addresses) {
        prefs().edit().putString("addresses", TextUtils.join("\n", addresses)).apply();
        render();
    }

    // Only the fixed address itself; the page asks for the password once.
    private void saveAddress(Uri u) {
        String clean = "https://" + u.getHost() + "/";
        List<String> addresses = addresses();
        if (!addresses.contains(clean)) addresses.add(clean);
        saveAddresses(addresses);
    }

    private void addAddressButtons() {
        for (final String address : addresses()) {
            final String host = Uri.parse(address).getHost();
            Button b = hostButton("🌐  " + host, false, v -> openUrl(address));
            b.setOnLongClickListener(v -> {
                new AlertDialog.Builder(this)
                        .setMessage(getString(R.string.remove_address, host))
                        .setPositiveButton(R.string.remove, (d, w) -> {
                            List<String> addresses = addresses();
                            addresses.remove(address);
                            saveAddresses(addresses);
                        })
                        .setNegativeButton(android.R.string.cancel, null)
                        .show();
                return true;
            });
            list.addView(b);
        }
        list.addView(hostButton(getString(R.string.add_address), false, v -> askAddress()));
    }

    private void askAddress() {
        final EditText input = new EditText(this);
        input.setHint("https://ayva.….workers.dev");
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        // The address was probably just copied from the computer.
        ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = cb == null ? null : cb.getPrimaryClip();
        if (clip != null && clip.getItemCount() > 0 && clip.getItemAt(0).getText() != null) {
            String text = clip.getItemAt(0).getText().toString().trim();
            if (text.startsWith("https://")) input.setText(text);
        }
        new AlertDialog.Builder(this)
                .setTitle(R.string.add_address)
                .setMessage(R.string.add_address_help)
                .setView(input)
                .setPositiveButton(R.string.connect, (d, w) -> {
                    String url = input.getText().toString().trim();
                    if (!url.startsWith("http")) url = "https://" + url;
                    Uri u = Uri.parse(url);
                    if (!"https".equals(u.getScheme()) || u.getHost() == null) return;
                    if (u.getHost().endsWith(".workers.dev")) saveAddress(u);
                    openUrl(url);
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    // ---- Views (built in code to keep the app dependency-free) ----

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(BG);
        int side = isTv() ? dp(48) : dp(20);
        root.setPadding(side, dp(40), side, dp(24));

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

        help = text(getString(isTv() ? R.string.help : R.string.help_phone), 15, MUTED);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, 0, 0, dp(16));
        root.addView(help);

        ScrollView scroll = new ScrollView(this);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);
        int width = Math.min(dp(520), getResources().getDisplayMetrics().widthPixels - 2 * side);
        root.addView(scroll, new LinearLayout.LayoutParams(width, LinearLayout.LayoutParams.WRAP_CONTENT));
        return root;
    }

    private Button hostButton(String label, boolean live, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        // Dark text on the gold focus highlight, light text otherwise.
        b.setTextColor(new ColorStateList(
                new int[][]{{android.R.attr.state_focused}, {android.R.attr.state_pressed}, {}},
                new int[]{ON_ACCENT, ON_ACCENT, Color.WHITE}));
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setPadding(dp(20), dp(16), dp(20), dp(16));
        b.setText(label);

        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_focused}, rounded(ACCENT));
        bg.addState(new int[]{android.R.attr.state_pressed}, rounded(ACCENT));
        bg.addState(new int[]{}, rounded(live ? LIVE_BG : PANEL));
        b.setBackground(bg);
        b.setFocusable(true);
        b.setOnClickListener(onClick);

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
