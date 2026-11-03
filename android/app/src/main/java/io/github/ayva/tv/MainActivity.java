package io.github.ayva.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.UiModeManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
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
 * A newer app from GitHub Releases is offered at the top of the list; the
 * ⚙ button opens Settings (version and update check, the app's battery and
 * permission settings, the project's page) on the same screen.
 */
public class MainActivity extends Activity implements Discovery.Listener, Updater.Listener {

    // The colour themes of the web pages (public/style.css), picked in Settings:
    // name, then background, card, panel, panel 3, text, muted, faint, accent,
    // accent pressed, text on the accent, a computer that shares.
    static final String[] THEMES = {"quince", "sea", "leaf", "plum", "rose", "light"};
    private static final int[][] PALETTES = {
        {0xFF16130E, 0xFF201C15, 0xFF2C271D, 0xFF3A3326, 0xFFF4EFE4, 0xFFA89F8C, 0xFF6F6552, 0xFFF2C14E, 0xFFE0A92A, 0xFF2A1D05, 0xFF2A1A17},
        {0xFF0F1419, 0xFF161D24, 0xFF1F2932, 0xFF2A3743, 0xFFEAF1F7, 0xFF93A3B1, 0xFF5D6B78, 0xFF5CB3F0, 0xFF3D9AE0, 0xFF04223A, 0xFF2A171A},
        {0xFF10150F, 0xFF171E16, 0xFF212A1F, 0xFF2C382A, 0xFFECF3E8, 0xFF9CAB95, 0xFF66735F, 0xFF8FD17C, 0xFF72BD5E, 0xFF0F2A07, 0xFF2A1717},
        {0xFF15111A, 0xFF1D1724, 0xFF282031, 0xFF352B40, 0xFFF1ECF6, 0xFFA99DB6, 0xFF6E6379, 0xFFC49AF2, 0xFFAD7EE8, 0xFF2A0F45, 0xFF2A1720},
        {0xFF1A1112, 0xFF23181A, 0xFF2F2123, 0xFF3D2B2E, 0xFFF7ECEC, 0xFFB59C9E, 0xFF7A6365, 0xFFF29A8A, 0xFFE77D6A, 0xFF3D0D06, 0xFF301616},
        {0xFFF7F3EA, 0xFFFFFFFF, 0xFFECE5D6, 0xFFE0D6C2, 0xFF2A2215, 0xFF6F6552, 0xFF9A8F7A, 0xFFE0A92A, 0xFFC8901A, 0xFF2A1D05, 0xFFFDE8E6},
    };
    private static int BG, CARD, PANEL, PANEL_3, TEXT, MUTED, FAINT, ACCENT, ACCENT_2, ON_ACCENT, LIVE_BG;
    private static final int LIVE = 0xFFE5484D;
    private static final int OK = 0xFF7CC46E;
    private static final long AUTO_CONNECT_WINDOW_MS = 4000;
    private static final int SCAN = 1;

    private Discovery discovery;
    private Updater updater;
    private LinearLayout list;
    private TextView title;
    private TextView help;
    private boolean settingsOpen;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long startedAt;
    private boolean autoConnect = true;
    private String focusedKey;
    private List<Discovery.Host> lastHosts = Collections.emptyList();

    // Text in the language chosen in Settings (Lang), not the phone's.
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(Lang.wrap(base));
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        settingsOpen = savedInstanceState != null && savedInstanceState.getBoolean("settings");
        useTheme(theme());
        setContentView(buildLayout());
        discovery = new Discovery(this, this);
        updater = new Updater(this, this);
        render();
        handleLink(getIntent());
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putBoolean("settings", settingsOpen);
    }

    // ---- Colour theme ----

    private String theme() {
        String t = prefs().getString("theme", "quince");
        for (String name : THEMES) if (name.equals(t)) return t;
        return "quince";
    }

    private static void useTheme(String name) {
        int[] p = PALETTES[0];
        for (int i = 0; i < THEMES.length; i++) if (THEMES[i].equals(name)) p = PALETTES[i];
        BG = p[0]; CARD = p[1]; PANEL = p[2]; PANEL_3 = p[3]; TEXT = p[4]; MUTED = p[5];
        FAINT = p[6]; ACCENT = p[7]; ACCENT_2 = p[8]; ON_ACCENT = p[9]; LIVE_BG = p[10];
    }

    // Saved, then the screen is drawn again in the new colours.
    private void pickTheme(String name) {
        prefs().edit().putString("theme", name).apply();
        recreate();
    }

    // A row of colour dots; the one in use has a ring.
    private View themeRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(4), dp(4), dp(4), dp(8));
        String now = theme();
        int[] names = {R.string.theme_quince, R.string.theme_sea, R.string.theme_leaf,
                R.string.theme_plum, R.string.theme_rose, R.string.theme_light};
        for (int i = 0; i < THEMES.length; i++) {
            final String name = THEMES[i];
            View dot = new View(this);
            GradientDrawable fill = new GradientDrawable();
            fill.setShape(GradientDrawable.OVAL);
            fill.setColor(i == THEMES.length - 1 ? PALETTES[i][0] : PALETTES[i][7]);
            fill.setStroke(dp(name.equals(now) ? 3 : 1), name.equals(now) ? TEXT : PANEL_3);
            GradientDrawable focus = new GradientDrawable();
            focus.setShape(GradientDrawable.OVAL);
            focus.setColor(i == THEMES.length - 1 ? PALETTES[i][0] : PALETTES[i][7]);
            focus.setStroke(dp(3), ACCENT);
            StateListDrawable d = new StateListDrawable();
            d.addState(new int[]{android.R.attr.state_focused}, focus);
            d.addState(new int[]{}, fill);
            dot.setBackground(d);
            dot.setFocusable(true);
            dot.setClickable(true);
            dot.setContentDescription(getString(names[i]));
            dot.setTag("theme-" + name);
            dot.setOnClickListener(v -> pickTheme(name));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(38), dp(38));
            lp.rightMargin = dp(12);
            row.addView(dot, lp);
        }
        return row;
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

        // With an update waiting or Settings open, stay here.
        if (autoConnect && !settingsOpen && updater.state() != Updater.State.AVAILABLE && maybeAutoConnect(hosts)) return;
        render();
    }

    private void render() {
        View focused = getCurrentFocus();
        if (focused != null && focused.getTag() instanceof String) focusedKey = (String) focused.getTag();

        list.removeAllViews();
        title.setVisibility(settingsOpen ? View.GONE : View.VISIBLE);
        help.setVisibility(settingsOpen ? View.GONE : View.VISIBLE);
        if (settingsOpen) {
            renderSettings();
            return;
        }
        View toFocus = addUpdateButton();
        boolean phone = !isTv();
        if (!lastHosts.isEmpty() || (phone && !addresses().isEmpty())) list.addView(section(R.string.section_computers));
        for (final Discovery.Host host : lastHosts) {
            View card = card("🖥", host.name, getString(host.live ? R.string.live_status : R.string.ready),
                    host.live ? LIVE : OK, host.live, v -> open(host));
            card.setTag(host.key());
            list.addView(card);
            if (toFocus == null) toFocus = card;
        }
        if (phone) addAddressButtons();
        View same = list.findViewWithTag(focusedKey);
        if (same != null) toFocus = same;
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
        return (isTv() ? "app=1&" : "") + "theme=" + theme() + "&lang=" + Lang.get(this) + "&name=" + Uri.encode(deviceName());
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

    // Ayva's page in the Play Store app, or on the web where there is none.
    private void openPlayPage() {
        String id = getPackageName();
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id)));
        } catch (Exception e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + id)));
            } catch (Exception ignored) {
            }
        }
    }

    // The update strip, while there is something to show; null otherwise.
    private View addUpdateButton() {
        String label;
        switch (updater.state()) {
            case AVAILABLE: label = getString(R.string.update_available, updater.latestVersion()); break;
            case DOWNLOADING: label = getString(R.string.update_downloading, updater.progress()); break;
            case INSTALLING: label = getString(R.string.update_installing); break;
            default: return null;
        }
        Button b = strip(label, v -> updater.install());
        b.setTag("update");
        list.addView(b);
        return b;
    }

    // ---- Settings ----

    private void openSettings(boolean open) {
        settingsOpen = open;
        focusedKey = open ? "back" : "settings";
        render();
    }

    @Override
    public void onBackPressed() {
        if (settingsOpen) openSettings(false);
        else super.onBackPressed();
    }

    private void renderSettings() {
        Button back = strip(getString(R.string.settings_back), v -> openSettings(false));
        back.setTag("back");
        list.addView(back);

        list.addView(section(R.string.settings_updates));
        if (!Updater.ENABLED) {
            // The Google Play build: updates come from Play, so this opens Ayva's page there.
            View version = card("⬆", getString(R.string.settings_version, updater.installedVersion()),
                    getString(R.string.settings_from_play), MUTED, false, v -> openPlayPage());
            version.setTag("version");
            list.addView(version);
        } else {
            addUpdateButton();
            int state;
            int dot = MUTED;
            switch (updater.state()) {
                case CHECKING: state = R.string.settings_checking; break;
                case UP_TO_DATE: state = R.string.settings_latest; dot = OK; break;
                case FAILED: state = R.string.settings_failed; dot = LIVE; break;
                default: state = R.string.settings_check;
            }
            View version = card("⬆", getString(R.string.settings_version, updater.installedVersion()),
                    getString(state), dot, false, v -> {
                        checkAsked = true;
                        updater.check(true);
                    });
            version.setTag("version");
            list.addView(version);
        }

        list.addView(section(R.string.settings_theme));
        list.addView(themeRow());

        list.addView(section(R.string.settings_language));
        String lang = Lang.get(this);
        for (int i = 0; i < Lang.CODES.length; i++) {
            final String code = Lang.CODES[i];
            boolean on = code.equals(lang);
            View c = card(on ? "✓" : "", Lang.NAMES[i], getString(on ? R.string.settings_in_use : R.string.settings_use),
                    on ? OK : MUTED, false, v -> {
                        if (code.equals(Lang.get(this))) return;
                        Lang.set(this, code);
                        recreate();
                    });
            c.setTag("lang-" + code);
            list.addView(c);
        }

        list.addView(section(R.string.settings_app));
        list.addView(card("🔋", getString(R.string.settings_app_info), getString(R.string.settings_app_info_hint),
                ACCENT, false, v -> startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", getPackageName(), null)))));
        if (!isTv()) {
            list.addView(section(R.string.settings_about));
            list.addView(card("ℹ", getString(R.string.settings_github), "github.com/Eilidhel/ayva", MUTED, false,
                    v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/Eilidhel/ayva")))));
        }
        View same = list.findViewWithTag(focusedKey);
        (same != null ? same : back).requestFocus();
    }

    // ---- Fixed addresses (phones) ----

    // An address opened with this app (from the camera, a message…): keep it and go there.
    // Anyone can make a workers.dev page, and a page opened here may ask for this
    // phone's screen; so a link from another app or a website to an address not
    // kept yet is shown first, and opens only on "Open". Scanned codes are the
    // user's own doing and open at once.
    private void handleLink(Intent intent) {
        handleLink(intent, false);
    }

    private void handleLink(Intent intent, boolean scanned) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"https".equals(data.getScheme()) || data.getHost() == null) return;
        Runnable go = () -> {
            if (data.getHost().endsWith(".workers.dev")) saveAddress(data);
            openUrl(data.toString());
        };
        if (scanned || addresses().contains("https://" + data.getHost() + "/")) {
            go.run();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle(R.string.link_title)
                .setMessage(getString(R.string.link_message, data.getHost()))
                .setPositiveButton(R.string.link_open, (d, w) -> go.run())
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != SCAN || resultCode != RESULT_OK || data == null) return;
        String text = data.getStringExtra(ScanActivity.EXTRA_TEXT);
        Uri u = text == null ? null : Uri.parse(text.trim());
        // Only the links Ayva shows: the fixed address and internet links.
        String host = u == null ? null : u.getHost();
        if (u == null || !"https".equals(u.getScheme()) || host == null
                || !(host.endsWith(".workers.dev") || host.endsWith(".trycloudflare.com"))) {
            Toast.makeText(this, R.string.scan_not_ayva, Toast.LENGTH_LONG).show();
            return;
        }
        handleLink(new Intent(Intent.ACTION_VIEW, u), true);
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

    // Fixed addresses as cards (a long press removes one), then two tiles to connect.
    private void addAddressButtons() {
        for (final String address : addresses()) {
            final String host = Uri.parse(address).getHost();
            View b = card("🌐", getString(R.string.fixed_address), host, OK, false, v -> openUrl(address));
            b.setTag(address);
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
        list.addView(section(R.string.section_connect));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        if (getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
            row.addView(tile("📷", getString(R.string.tile_scan), true,
                    v -> startActivityForResult(new Intent(this, ScanActivity.class), SCAN)));
        }
        row.addView(tile("🔗", getString(R.string.tile_address), false, v -> askAddress()));
        if (row.getChildCount() == 2) {
            ((LinearLayout.LayoutParams) row.getChildAt(0).getLayoutParams()).rightMargin = dp(5);
            ((LinearLayout.LayoutParams) row.getChildAt(1).getLayoutParams()).leftMargin = dp(5);
        }
        list.addView(row, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
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
        SystemBars.pad(root);

        int width = Math.min(dp(520), getResources().getDisplayMetrics().widthPixels - 2 * side);
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        header.addView(logo, new LinearLayout.LayoutParams(dp(44), dp(44)));
        TextView name = text(getString(R.string.app_name), 28, TEXT);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setPadding(dp(12), 0, 0, 0);
        header.addView(name, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        TextView gear = text("⚙", 22, MUTED);
        gear.setGravity(Gravity.CENTER);
        gear.setBackground(states(CARD, CARD, PANEL, 14));
        gear.setFocusable(true);
        gear.setClickable(true);
        gear.setContentDescription(getString(R.string.settings_title));
        gear.setTag("settings");
        gear.setOnClickListener(v -> openSettings(!settingsOpen));
        header.addView(gear, new LinearLayout.LayoutParams(dp(46), dp(46)));
        root.addView(header, new LinearLayout.LayoutParams(width, LinearLayout.LayoutParams.WRAP_CONTENT));

        title = text(getString(R.string.searching), 17, TEXT);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(22), 0, dp(4));
        root.addView(title);

        help = text(getString(isTv() ? R.string.help : R.string.help_phone), 14, MUTED);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, 0, 0, dp(14));
        root.addView(help);

        ScrollView scroll = new ScrollView(this);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);
        list.setPadding(0, dp(8), 0, 0);
        root.addView(scroll, new LinearLayout.LayoutParams(width, LinearLayout.LayoutParams.WRAP_CONTENT));
        return root;
    }

    // A small heading over a group ("Computers", "Connect").
    private TextView section(int res) {
        TextView tv = text(getString(res), 13, MUTED);
        tv.setPadding(dp(4), dp(14), 0, dp(8));
        return tv;
    }

    // A computer or fixed address: an icon in a box, the name, a coloured dot
    // and its state; a LIVE pill while it shares. Focused (TV remote) or
    // pressed, it gets a gold frame.
    private View card(String icon, String name, String state, int dot, boolean live, View.OnClickListener onClick) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.HORIZONTAL);
        c.setGravity(Gravity.CENTER_VERTICAL);
        c.setPadding(dp(12), dp(12), dp(14), dp(12));
        int bg = live ? LIVE_BG : CARD;
        c.setBackground(states(bg, bg, live ? 0x66E5484D : PANEL, 18));
        c.setFocusable(true);
        c.setClickable(true);
        c.setOnClickListener(onClick);

        TextView box = text(icon, 20, ACCENT);
        box.setGravity(Gravity.CENTER);
        box.setBackground(rounded(PANEL, 12));
        c.addView(box, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        words.setPadding(dp(12), 0, dp(8), 0);
        TextView n = text(name, 17, TEXT);
        n.setTypeface(Typeface.DEFAULT_BOLD);
        n.setSingleLine(true);
        n.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(n);
        TextView st = text("●  " + state, 13, MUTED);
        android.text.SpannableString sp = new android.text.SpannableString(st.getText());
        sp.setSpan(new android.text.style.ForegroundColorSpan(dot), 0, 1, 0);
        st.setText(sp);
        st.setSingleLine(true);
        st.setEllipsize(TextUtils.TruncateAt.END);
        words.addView(st);
        c.addView(words, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));

        if (live) {
            TextView pill = text(getString(R.string.live), 11, Color.WHITE); // white on red in every theme
            pill.setTypeface(Typeface.DEFAULT_BOLD);
            pill.setPadding(dp(9), dp(3), dp(9), dp(3));
            pill.setBackground(rounded(LIVE, 999));
            c.addView(pill);
        } else {
            c.addView(text("›", 22, MUTED));
        }

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        c.setLayoutParams(lp);
        return c;
    }

    // A square tile to connect (scan the QR code, add a fixed address): a big
    // icon over its name; the first one is gold.
    private View tile(String icon, String label, boolean main, View.OnClickListener onClick) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(8), dp(18), dp(8), dp(16));
        int bg = main ? ACCENT : CARD;
        t.setBackground(states(bg, main ? ACCENT_2 : PANEL, main ? ACCENT : PANEL, 18));
        t.setFocusable(true);
        t.setClickable(true);
        t.setOnClickListener(onClick);
        TextView i = text(icon, 26, main ? ON_ACCENT : ACCENT);
        i.setGravity(Gravity.CENTER);
        t.addView(i);
        TextView l = text(label, 14, main ? ON_ACCENT : TEXT);
        l.setTypeface(Typeface.DEFAULT_BOLD);
        l.setGravity(Gravity.CENTER);
        l.setPadding(0, dp(8), 0, 0);
        t.addView(l);
        t.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        return t;
    }

    // The update offer: a thin gold-framed strip, not a big button.
    private Button strip(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setText(label);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTextColor(new ColorStateList(
                new int[][]{{android.R.attr.state_focused}, {android.R.attr.state_pressed}, {}},
                new int[]{ON_ACCENT, ON_ACCENT, TEXT}));
        b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        b.setPadding(dp(16), dp(12), dp(16), dp(12));
        StateListDrawable bg = new StateListDrawable();
        bg.addState(new int[]{android.R.attr.state_focused}, rounded(ACCENT, 14));
        bg.addState(new int[]{android.R.attr.state_pressed}, rounded(ACCENT, 14));
        GradientDrawable idle = rounded((ACCENT & 0x00FFFFFF) | 0x1F000000, 14);
        idle.setStroke(dp(1), (ACCENT & 0x00FFFFFF) | 0x99000000);
        bg.addState(new int[]{}, idle);
        b.setBackground(bg);
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(10);
        b.setLayoutParams(lp);
        return b;
    }

    // Resting, pressed and focused looks; focused and pressed get a gold frame
    // (what the TV remote is on must be clear from across the room).
    private StateListDrawable states(int rest, int pressed, int border, int radius) {
        StateListDrawable d = new StateListDrawable();
        GradientDrawable focus = rounded(pressed == rest ? PANEL : pressed, radius);
        focus.setStroke(dp(2), ACCENT);
        GradientDrawable down = rounded(pressed == rest ? PANEL : pressed, radius);
        down.setStroke(dp(2), ACCENT);
        GradientDrawable idle = rounded(rest, radius);
        if (border != Color.TRANSPARENT) idle.setStroke(dp(1), border);
        d.addState(new int[]{android.R.attr.state_focused}, focus);
        d.addState(new int[]{android.R.attr.state_pressed}, down);
        d.addState(new int[]{}, idle);
        return d;
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radius));
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
