package io.github.ayva.tv;

import android.app.Activity;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Saves files and recordings from the page into Downloads (window.AyvaFiles).
 * WebView cannot download the page's blob: links itself, so public/inbox.js
 * hands the bytes over in base64 pieces.
 */
class FileSaver {

    private final Activity activity;
    private final Map<Integer, OutputStream> open = new HashMap<>();
    private int next = 1;

    FileSaver(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public synchronized int begin(String name, String mime) {
        String clean = name == null ? "Ayva" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
        try {
            OutputStream out;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, clean);
                values.put(MediaStore.Downloads.MIME_TYPE, mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Ayva");
                Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return 0;
                out = activity.getContentResolver().openOutputStream(uri);
            } else {
                // Older Android: the app's own folder needs no storage permission.
                File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) return 0;
                out = new FileOutputStream(new File(dir, clean));
            }
            if (out == null) return 0;
            int id = next++;
            open.put(id, out);
            return id;
        } catch (Exception e) {
            return 0;
        }
    }

    @JavascriptInterface
    public synchronized boolean chunk(int id, String base64) {
        OutputStream out = open.get(id);
        if (out == null) return false;
        try {
            out.write(Base64.decode(base64, Base64.DEFAULT));
            return true;
        } catch (Exception e) {
            close(id);
            return false;
        }
    }

    @JavascriptInterface
    public synchronized boolean end(int id, String name) {
        boolean ok = close(id);
        if (ok) {
            activity.runOnUiThread(() -> Toast.makeText(activity,
                    activity.getString(R.string.saved, name), Toast.LENGTH_LONG).show());
        }
        return ok;
    }

    private boolean close(int id) {
        OutputStream out = open.remove(id);
        if (out == null) return false;
        try {
            out.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
