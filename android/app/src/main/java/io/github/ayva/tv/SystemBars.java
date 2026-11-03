package io.github.ayva.tv;

import android.os.Build;
import android.view.View;
import android.view.WindowInsets;

/**
 * Keeps a screen's content clear of the system bars and the camera cutout.
 *
 * Android 15 and later draw every app edge to edge, under the status and
 * navigation bars, for apps that target them. This adds the bars' sizes to a
 * view's own padding, so nothing (a button, the QR hint) ends up behind the
 * phone's navigation bar. On older Android the bars take their own room and
 * the sizes come in as zero, so nothing changes there.
 */
final class SystemBars {

    private SystemBars() { }

    static void pad(View view) {
        final int left = view.getPaddingLeft();
        final int top = view.getPaddingTop();
        final int right = view.getPaddingRight();
        final int bottom = view.getPaddingBottom();
        view.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft();
                t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight();
                b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left + l, top + t, right + r, bottom + b);
            return insets;
        });
        view.requestApplyInsets();
    }
}
