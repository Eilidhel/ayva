package io.github.ayva.tv;

import android.os.Looper;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Method;

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
 * It answers "ok" once ready, and stops when standard input closes.
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
                key(cmd[1]);
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

    private static void key(String which) throws Exception {
        int code;
        if (which.equals("back")) code = KeyEvent.KEYCODE_BACK;
        else if (which.equals("home")) code = KeyEvent.KEYCODE_HOME;
        else if (which.equals("recents")) code = KeyEvent.KEYCODE_APP_SWITCH;
        else return;
        long now = SystemClock.uptimeMillis();
        for (int action : new int[]{KeyEvent.ACTION_DOWN, KeyEvent.ACTION_UP}) {
            KeyEvent e = new KeyEvent(now, now, action, code, 0, 0, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, 0,
                    InputDevice.SOURCE_KEYBOARD);
            send(e);
        }
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
