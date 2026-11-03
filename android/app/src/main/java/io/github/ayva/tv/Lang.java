package io.github.ayva.tv;

import android.content.Context;
import android.content.res.Configuration;

import java.util.Locale;

/**
 * The app's language, chosen in Settings: English unless Türkçe was picked,
 * whatever the phone's own language is. Each screen and the screen-sharing
 * service draw their text through {@link #wrap}; the watch page gets the same
 * choice (?lang=).
 */
final class Lang {

    static final String[] CODES = {"en", "tr"};
    static final String[] NAMES = {"English", "Türkçe"};

    private Lang() {
    }

    static String get(Context c) {
        String l = c.getSharedPreferences("ayva", Context.MODE_PRIVATE).getString("lang", "en");
        return "tr".equals(l) ? "tr" : "en";
    }

    static void set(Context c, String lang) {
        c.getSharedPreferences("ayva", Context.MODE_PRIVATE).edit().putString("lang", lang).apply();
    }

    static Context wrap(Context base) {
        Locale locale = new Locale(get(base));
        Configuration conf = new Configuration(base.getResources().getConfiguration());
        conf.setLocale(locale);
        return base.createConfigurationContext(conf);
    }
}
