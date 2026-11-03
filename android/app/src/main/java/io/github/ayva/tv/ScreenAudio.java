package io.github.ayva.tv;

import android.annotation.TargetApi;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.MediaCodec;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;

import java.nio.ByteBuffer;

/**
 * The sound the phone plays (videos, music, games), captured alongside its
 * screen (Android 10+; apps can opt out, calls never come along) and encoded
 * as Opus. Each packet goes out like a picture from ScreenEncoder, with flag
 * 8: [8][time in µs, 8 bytes][Opus packet]. The time uses the same clock as
 * the pictures, so the computer can keep them together.
 */
@TargetApi(29)
final class ScreenAudio {

    private static final int RATE = 48000;
    private static final int CHANNELS = 2;
    private static final int BYTES_PER_MS = RATE / 1000 * CHANNELS * 2;

    private final AudioRecord rec;
    private final MediaCodec codec;
    private final ScreenEncoder.Output out;
    private final Thread input;
    private final Thread output;
    private volatile boolean running = true;
    private volatile int peak; // loudest sample since peakDb() was last asked
    // Loudest sample in the last whole second and in the one going on, for
    // telling whether muting the phone also silenced what is captured.
    private volatile int lastSecondPeak, thisSecondPeak;
    private long secondStartMs;

    ScreenAudio(MediaProjection projection, ScreenEncoder.Output out) throws Exception {
        this.out = out;
        AudioPlaybackCaptureConfiguration capture = new AudioPlaybackCaptureConfiguration.Builder(projection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build();
        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(RATE)
                .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                .build();
        int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT);
        rec = new AudioRecord.Builder()
                .setAudioFormat(format)
                .setBufferSizeInBytes(Math.max(min, BYTES_PER_MS * 200))
                .setAudioPlaybackCaptureConfig(capture)
                .build();
        if (rec.getState() != AudioRecord.STATE_INITIALIZED) {
            rec.release();
            throw new IllegalStateException("no playback capture");
        }
        codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS);
        MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, RATE, CHANNELS);
        f.setInteger(MediaFormat.KEY_BIT_RATE, 128_000);
        try {
            codec.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            codec.start();
        } catch (RuntimeException e) {
            codec.release();
            rec.release();
            throw e;
        }
        rec.startRecording();
        input = new Thread(this::inputLoop, "ayva-screen-audio-in");
        output = new Thread(this::outputLoop, "ayva-screen-audio-out");
        input.start();
        output.start();
    }

    // The loudest sound since the last call, in dB below full scale (-99: silence).
    int peakDb() {
        int p = peak;
        peak = 0;
        return p <= 0 ? -99 : (int) Math.round(20 * Math.log10(p / 32767.0));
    }

    // The loudest sound in the last second or two, in dB (-99: silence).
    int recentDb() {
        int p = Math.max(lastSecondPeak, thisSecondPeak);
        return p <= 0 ? -99 : (int) Math.round(20 * Math.log10(p / 32767.0));
    }

    private void inputLoop() {
        byte[] buf = new byte[BYTES_PER_MS * 20];
        try {
            while (running) {
                int n = rec.read(buf, 0, buf.length);
                if (n <= 0) continue;
                // When the first sample was played, on the pictures' clock.
                long timeUs = System.nanoTime() / 1000 - (long) n * 1000 / BYTES_PER_MS;
                int loudest = 0;
                for (int i = 0; i + 1 < n; i += 2) {
                    int s = Math.abs((short) ((buf[i] & 0xff) | (buf[i + 1] << 8)));
                    if (s > loudest) loudest = s;
                }
                if (loudest > peak) peak = loudest;
                long nowMs = timeUs / 1000;
                if (nowMs - secondStartMs >= 1000) {
                    lastSecondPeak = thisSecondPeak;
                    thisSecondPeak = 0;
                    secondStartMs = nowMs;
                }
                if (loudest > thisSecondPeak) thisSecondPeak = loudest;
                int index = codec.dequeueInputBuffer(20_000);
                if (index < 0) continue; // encoder behind: this bit is left out
                ByteBuffer in = codec.getInputBuffer(index);
                if (in == null) continue;
                in.clear();
                int len = Math.min(n, in.remaining());
                in.put(buf, 0, len);
                codec.queueInputBuffer(index, 0, len, timeUs, 0);
            }
        } catch (IllegalStateException ignored) {
            // stopped
        }
    }

    private void outputLoop() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        try {
            while (running) {
                int index = codec.dequeueOutputBuffer(info, 100_000);
                if (index < 0) continue;
                ByteBuffer buf = codec.getOutputBuffer(index);
                if (buf != null && info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
                    byte[] msg = new byte[9 + info.size];
                    ByteBuffer b = ByteBuffer.wrap(msg);
                    b.put((byte) 8);
                    b.putLong(info.presentationTimeUs);
                    buf.position(info.offset);
                    buf.limit(info.offset + info.size);
                    b.put(buf);
                    out.frame(msg);
                }
                codec.releaseOutputBuffer(index, false);
            }
        } catch (IllegalStateException ignored) {
            // stopped
        }
    }

    void stop() {
        running = false;
        try {
            rec.stop();
        } catch (IllegalStateException ignored) {
        }
        try {
            input.join(500);
            output.join(500);
        } catch (InterruptedException ignored) {
        }
        try {
            codec.stop();
        } catch (IllegalStateException ignored) {
        }
        codec.release();
        rec.release();
    }
}
