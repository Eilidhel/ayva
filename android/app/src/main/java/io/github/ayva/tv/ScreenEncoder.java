package io.github.ayva.tv;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Bundle;
import android.view.Surface;

import java.io.IOException;
import java.nio.ByteBuffer;

/**
 * The phone's hardware H.264 encoder, fed through a Surface (the screen's
 * virtual display). Each encoded picture goes out as one message:
 * [flags: 1 = key frame][presentation time in µs, 8 bytes][Annex B data].
 * Key frames carry the SPS/PPS in front, so the computer can start decoding
 * at any of them.
 */
final class ScreenEncoder {

    interface Output {
        void frame(byte[] data);

        void failed();
    }

    static final int FPS = 60;
    private static final int KEY_INTERVAL_S = 2;
    // A still screen makes no new pictures; repeating the last one after this
    // long keeps key frame requests answered.
    private static final long REPEAT_US = 100_000;

    private final MediaCodec codec;
    private final Surface surface;
    private final Output out;
    private final Thread drain;
    private volatile boolean running = true;
    private byte[] config = new byte[0];
    // Pictures made since the computer last asked (see ScreenService.encodedFrames).
    static final java.util.concurrent.atomic.AtomicInteger encoded = new java.util.concurrent.atomic.AtomicInteger();

    ScreenEncoder(int width, int height, int bitrate, Output out) throws IOException {
        this.out = out;
        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
        try {
            configure(width, height, bitrate, true);
        } catch (RuntimeException e) {
            // Some encoders refuse the low-latency hints; the plain settings work everywhere.
            codec.reset();
            configure(width, height, bitrate, false);
        }
        surface = codec.createInputSurface();
        codec.start();
        drain = new Thread(this::drainLoop, "ayva-screen-encoder");
        drain.start();
    }

    private void configure(int width, int height, int bitrate, boolean tuned) {
        MediaFormat f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height);
        f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
        f.setInteger(MediaFormat.KEY_BIT_RATE, bitrate);
        f.setInteger(MediaFormat.KEY_FRAME_RATE, FPS);
        f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, KEY_INTERVAL_S);
        f.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, REPEAT_US);
        if (tuned) {
            // Baseline has no B-frames: every picture can be shown as soon as it arrives.
            if (Build.VERSION.SDK_INT >= 23) {
                f.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline);
                f.setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel4);
                f.setInteger(MediaFormat.KEY_PRIORITY, 0); // real time
            }
            if (Build.VERSION.SDK_INT >= 29) {
                f.setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0);
                // 90-120 Hz screens would otherwise hand the encoder every refresh;
                // 60 keeps 30 fps videos even (a 30 limit drops their frames unevenly).
                f.setFloat(MediaFormat.KEY_MAX_FPS_TO_ENCODER, FPS);
            }
            if (Build.VERSION.SDK_INT >= 30) f.setInteger(MediaFormat.KEY_LATENCY, 1);
        }
        codec.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
    }

    Surface surface() {
        return surface;
    }

    void requestKeyFrame() {
        Bundle b = new Bundle();
        b.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0);
        try {
            codec.setParameters(b);
        } catch (IllegalStateException ignored) {
        }
    }

    void setBitrate(int bitrate) {
        Bundle b = new Bundle();
        b.putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, bitrate);
        try {
            codec.setParameters(b);
        } catch (IllegalStateException ignored) {
        }
    }

    private void drainLoop() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        try {
            while (running) {
                int index = codec.dequeueOutputBuffer(info, 100_000);
                if (index < 0) continue;
                ByteBuffer buf = codec.getOutputBuffer(index);
                if (buf != null && info.size > 0) {
                    byte[] data = new byte[info.size];
                    buf.position(info.offset);
                    buf.get(data);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                        config = data;
                    } else {
                        boolean key = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0;
                        encoded.incrementAndGet();
                        out.frame(pack(key, info.presentationTimeUs, key ? config : new byte[0], data));
                    }
                }
                codec.releaseOutputBuffer(index, false);
            }
        } catch (IllegalStateException e) {
            if (running) out.failed();
        }
    }

    private static byte[] pack(boolean key, long timeUs, byte[] prefix, byte[] data) {
        byte[] msg = new byte[9 + prefix.length + data.length];
        ByteBuffer b = ByteBuffer.wrap(msg);
        b.put((byte) (key ? 1 : 0));
        b.putLong(timeUs);
        b.put(prefix);
        b.put(data);
        return msg;
    }

    void stop() {
        running = false;
        try {
            drain.join(500);
        } catch (InterruptedException ignored) {
        }
        try {
            codec.stop();
        } catch (IllegalStateException ignored) {
        }
        codec.release();
        surface.release();
    }
}
