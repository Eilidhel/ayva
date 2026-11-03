package io.github.ayva.tv;

import android.content.ClipData;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Touches from the computer, while this phone's screen is shown there.
 *
 * Not part of the app as such: the computer starts it over ADB (Wireless
 * debugging, which the user pairs once) with the shell's rights, which may
 * inject input, the same way scrcpy does:
 *   CLASSPATH=<this APK> app_process / io.github.ayva.tv.InputServer
 * It reads one command per line from standard input; positions are fractions
 * of the screen (0..1), as the computer shows it:
 *   down x y | move x y | up x y      one finger, as the mouse moves
 *   scroll x y dy                     the mouse wheel (dy: notches, + is down)
 *   key back|home|recents             the phone's own buttons
 *   key <name> [ctrl] [shift]         a key of the computer's keyboard (see KEYS)
 *   text <base64 UTF-8>               typed characters
 *   paste <base64 UTF-8>              text put on the phone's clipboard and pasted
 * It answers "ok" once ready, and stops when standard input closes.
 *
 * Typed characters go as key presses when Android's virtual keyboard map has
 * them (plain letters, digits, most signs). The rest (ş, ğ, ı, emoji...) has
 * no key there, so it is pasted through the phone's clipboard instead.
 */
public final class InputServer {

    private static Object inputManager;
    private static Method inject;
    private static long downTime;

    public static void main(String[] args) throws Exception {
        if (Looper.myLooper() == null) Looper.prepare();
        findInjector();
        System.out.println("ok");
        System.out.flush();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = in.readLine()) != null) {
            try {
                handle(line.trim().split(" "));
            } catch (Exception e) {
                System.out.println("error " + e);
                System.out.flush();
            }
        }
    }

    // InputManagerGlobal on Android 14+, InputManager before; injectInputEvent is hidden.
    private static void findInjector() throws Exception {
        Class<?> c;
        try {
            c = Class.forName("android.hardware.input.InputManagerGlobal");
        } catch (ClassNotFoundException e) {
            c = Class.forName("android.hardware.input.InputManager");
        }
        inputManager = c.getMethod("getInstance").invoke(null);
        inject = c.getMethod("injectInputEvent", InputEvent.class, int.class);
    }

    private static void send(InputEvent e) throws Exception {
        inject.invoke(inputManager, e, 0); // 0: don't wait for the app to handle it
    }

    private static void handle(String[] cmd) throws Exception {
        if (cmd.length == 0) return;
        switch (cmd[0]) {
            case "down":
            case "move":
            case "up":
                touch(cmd[0], Float.parseFloat(cmd[1]), Float.parseFloat(cmd[2]));
                break;
            case "scroll":
                scroll(Float.parseFloat(cmd[1]), Float.parseFloat(cmd[2]), Float.parseFloat(cmd[3]));
                break;
            case "key":
                int meta = 0;
                for (int i = 2; i < cmd.length; i++) {
                    if (cmd[i].equals("ctrl")) meta |= KeyEvent.META_CTRL_ON | KeyEvent.META_CTRL_LEFT_ON;
                    else if (cmd[i].equals("shift")) meta |= KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON;
                }
                key(cmd[1], meta);
                break;
            case "text":
                type(decode(cmd[1]));
                break;
            case "paste":
                paste(decode(cmd[1]));
                break;
            default:
                break;
        }
    }

    private static void touch(String what, float fx, float fy) throws Exception {
        int[] size = screenSize();
        float x = clamp(fx) * (size[0] - 1);
        float y = clamp(fy) * (size[1] - 1);
        long now = SystemClock.uptimeMillis();
        int action;
        if (what.equals("down")) {
            downTime = now;
            action = MotionEvent.ACTION_DOWN;
        } else if (what.equals("move")) {
            action = MotionEvent.ACTION_MOVE;
        } else {
            action = MotionEvent.ACTION_UP;
        }
        MotionEvent e = MotionEvent.obtain(downTime, now, action, x, y, 0);
        e.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        send(e);
        e.recycle();
    }

    // A mouse wheel event; apps scroll lists by it like on a phone with a mouse.
    private static void scroll(float fx, float fy, float notches) throws Exception {
        int[] size = screenSize();
        MotionEvent.PointerProperties[] props = {new MotionEvent.PointerProperties()};
        props[0].id = 0;
        props[0].toolType = MotionEvent.TOOL_TYPE_MOUSE;
        MotionEvent.PointerCoords[] coords = {new MotionEvent.PointerCoords()};
        coords[0].x = clamp(fx) * (size[0] - 1);
        coords[0].y = clamp(fy) * (size[1] - 1);
        coords[0].setAxisValue(MotionEvent.AXIS_VSCROLL, -notches);
        long now = SystemClock.uptimeMillis();
        MotionEvent e = MotionEvent.obtain(now, now, MotionEvent.ACTION_SCROLL, 1, props, coords,
                0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_MOUSE, 0);
        send(e);
        e.recycle();
    }

    // The keys the computer may send by name (Ctrl+A/C/X/Z/Y for editing).
    private static final Map<String, Integer> KEYS = new HashMap<>();

    static {
        KEYS.put("back", KeyEvent.KEYCODE_BACK);
        KEYS.put("home", KeyEvent.KEYCODE_HOME);
        KEYS.put("recents", KeyEvent.KEYCODE_APP_SWITCH);
        KEYS.put("enter", KeyEvent.KEYCODE_ENTER);
        KEYS.put("del", KeyEvent.KEYCODE_DEL);
        KEYS.put("fdel", KeyEvent.KEYCODE_FORWARD_DEL);
        KEYS.put("tab", KeyEvent.KEYCODE_TAB);
        KEYS.put("up", KeyEvent.KEYCODE_DPAD_UP);
        KEYS.put("down", KeyEvent.KEYCODE_DPAD_DOWN);
        KEYS.put("left", KeyEvent.KEYCODE_DPAD_LEFT);
        KEYS.put("right", KeyEvent.KEYCODE_DPAD_RIGHT);
        KEYS.put("mhome", KeyEvent.KEYCODE_MOVE_HOME);
        KEYS.put("mend", KeyEvent.KEYCODE_MOVE_END);
        KEYS.put("pgup", KeyEvent.KEYCODE_PAGE_UP);
        KEYS.put("pgdn", KeyEvent.KEYCODE_PAGE_DOWN);
        KEYS.put("a", KeyEvent.KEYCODE_A);
        KEYS.put("c", KeyEvent.KEYCODE_C);
        KEYS.put("x", KeyEvent.KEYCODE_X);
        KEYS.put("z", KeyEvent.KEYCODE_Z);
        KEYS.put("y", KeyEvent.KEYCODE_Y);
    }

    private static void key(String which, int meta) throws Exception {
        Integer code = KEYS.get(which);
        if (code != null) press(code, meta);
    }

    private static void press(int code, int meta) throws Exception {
        long now = SystemClock.uptimeMillis();
        for (int action : new int[]{KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
            KeyEvent e = new KeyEvent(now, now, action, code, 0, meta, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, 0,
                    InputDevice.SOURCE_KEYBOARD);
            send(e);
        }
    }

    private static String decode(String b64) {
        return new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8);
    }

    // Runs of characters the key map has go as key presses, the others are pasted.
    private static void type(String text) throws Exception {
        KeyCharacterMap map = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD);
        StringBuilder other = new StringBuilder();
        for (char c : text.toCharArray()) {
            KeyEvent[] events = map.getEvents(new char[]{c});
            if (events == null) {
                other.append(c);
                continue;
            }
            if (other.length() > 0) {
                paste(other.toString());
                other.setLength(0);
            }
            long now = SystemClock.uptimeMillis();
            for (KeyEvent e : events) send(KeyEvent.changeTimeRepeat(e, now, 0));
        }
        if (other.length() > 0) paste(other.toString());
    }

    private static void paste(String text) throws Exception {
        setClipboard(text);
        press(KeyEvent.KEYCODE_PASTE, 0);
    }

    // The clipboard service, called as the shell (like scrcpy). setPrimaryClip's
    // arguments differ between Android versions: the clip, the calling package,
    // then an attribution tag, the user and the device, as far as there are any.
    private static void setClipboard(String text) throws Exception {
        Class<?> sm = Class.forName("android.os.ServiceManager");
        IBinder binder = (IBinder) sm.getMethod("getService", String.class).invoke(null, "clipboard");
        Object clipboard = Class.forName("android.content.IClipboard$Stub")
                .getMethod("asInterface", IBinder.class).invoke(null, binder);
        ClipData clip = ClipData.newPlainText(null, text);
        for (Method m : clipboard.getClass().getMethods()) {
            if (!m.getName().equals("setPrimaryClip")) continue;
            Class<?>[] types = m.getParameterTypes();
            Object[] args = new Object[types.length];
            boolean packageGiven = false;
            boolean usable = true;
            for (int i = 0; i < types.length; i++) {
                if (types[i] == ClipData.class) args[i] = clip;
                else if (types[i] == String.class) {
                    args[i] = packageGiven ? null : "com.android.shell";
                    packageGiven = true;
                } else if (types[i] == int.class) args[i] = 0;
                else usable = false;
            }
            if (!usable) continue;
            m.invoke(clipboard, args);
            return;
        }
        throw new IllegalStateException("no setPrimaryClip");
    }

    // The screen as it is now (sides swap when the phone is turned).
    private static int[] screenSize() throws Exception {
        Class<?> c = Class.forName("android.hardware.display.DisplayManagerGlobal");
        Object dm = c.getMethod("getInstance").invoke(null);
        Object info = c.getMethod("getDisplayInfo", int.class).invoke(dm, 0);
        int w = info.getClass().getField("logicalWidth").getInt(info);
        int h = info.getClass().getField("logicalHeight").getInt(info);
        return new int[]{w, h};
    }

    private static float clamp(float v) {
        return Math.max(0f, Math.min(1f, v));
    }
}
