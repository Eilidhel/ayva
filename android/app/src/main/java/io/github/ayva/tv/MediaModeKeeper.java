package io.github.ayva.tv;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

/**
 * Keeps Bluetooth headphones in music mode while "Talk" is on.
 *
 * When the page opens the microphone, WebView (like Chrome) switches the phone
 * into call mode, and Bluetooth headphones drop to their call profile: the
 * stream's sound turns muffled or moves to the phone's speaker. While the
 * player is in front and has used the microphone, this switches the phone back
 * to normal mode whenever Bluetooth music headphones are connected. The
 * microphone then records from the phone itself, and the sound stays in the
 * headphones. Only call mode set for this app's own audio (in communication)
 * is touched, never a real phone call (in call).
 */
@SuppressWarnings("deprecation") // the SCO calls are the only way before Android 12
class MediaModeKeeper {

    private final AudioManager audio;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean running;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            keepMusicMode();
            if (running) handler.postDelayed(this, 1000);
        }
    };

    MediaModeKeeper(Context context) {
        audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }

    void start() {
        if (running || audio == null || Build.VERSION.SDK_INT < 23) return;
        running = true;
        handler.post(tick);
    }

    void stop() {
        running = false;
        handler.removeCallbacks(tick);
    }

    private boolean bluetoothHeadphones() {
        for (AudioDeviceInfo d : audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int type = d.getType();
            if (type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) return true;
            if (Build.VERSION.SDK_INT >= 31 && type == AudioDeviceInfo.TYPE_BLE_HEADSET) return true;
        }
        return false;
    }

    private void keepMusicMode() {
        if (audio.getMode() != AudioManager.MODE_IN_COMMUNICATION || !bluetoothHeadphones()) return;
        if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice();
        audio.stopBluetoothSco();
        audio.setBluetoothScoOn(false);
        audio.setSpeakerphoneOn(false);
        audio.setMode(AudioManager.MODE_NORMAL);
    }
}
