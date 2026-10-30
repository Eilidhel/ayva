package io.github.ayva.tv;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Scans the QR code shown in Ayva on the computer without leaving the app
 * (the phone's camera app would open the link in the browser instead).
 * Frames are decoded on the phone with ZXing and never stored or sent.
 * Returns the code's text in {@link #EXTRA_TEXT}.
 */
@SuppressWarnings("deprecation") // android.hardware.Camera: simple, and works on every Android version Ayva runs on
public class ScanActivity extends Activity implements TextureView.SurfaceTextureListener, Camera.PreviewCallback {

    static final String EXTRA_TEXT = "text";
    private static final int ASK_CAMERA = 1;

    private TextureView view;
    private Camera camera;
    private int cameraId = -1;
    private int previewWidth;
    private int previewHeight;
    private HandlerThread worker;
    private Handler decoder;
    private volatile boolean busy;
    private volatile boolean done;
    private final MultiFormatReader reader = new MultiFormatReader();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, Collections.singletonList(BarcodeFormat.QR_CODE));
        reader.setHints(hints);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new TextureView(this);
        view.setSurfaceTextureListener(this);
        root.addView(view);
        TextView hint = new TextView(this);
        hint.setText(R.string.scan_hint);
        hint.setTextColor(Color.WHITE);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        hint.setGravity(Gravity.CENTER);
        hint.setBackgroundColor(0xAA000000);
        int pad = Math.round(16 * getResources().getDisplayMetrics().density);
        hint.setPadding(pad, pad, pad, pad * 2);
        root.addView(hint, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        worker = new HandlerThread("qr");
        worker.start();
        decoder = new Handler(worker.getLooper());
        busy = false;
        if (hasCamera()) startCamera();
        else if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{Manifest.permission.CAMERA}, ASK_CAMERA);
    }

    @Override
    protected void onPause() {
        super.onPause();
        stopCamera();
        worker.quitSafely();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != ASK_CAMERA) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            Toast.makeText(this, R.string.camera_denied, Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private boolean hasCamera() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void startCamera() {
        if (camera != null || !view.isAvailable() || !hasCamera()) return;
        try {
            cameraId = backCamera();
            camera = Camera.open(cameraId);
            Camera.Parameters p = camera.getParameters();
            Camera.Size size = pickSize(p.getSupportedPreviewSizes());
            p.setPreviewSize(size.width, size.height);
            if (p.getSupportedFocusModes().contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            }
            camera.setParameters(p);
            previewWidth = size.width;
            previewHeight = size.height;
            int rotation = displayRotation();
            camera.setDisplayOrientation(rotation);
            fitPreview(rotation % 180 != 0);
            camera.setPreviewTexture(view.getSurfaceTexture());
            camera.addCallbackBuffer(new byte[previewWidth * previewHeight * 3 / 2]);
            camera.setPreviewCallbackWithBuffer(this);
            camera.startPreview();
        } catch (Exception e) {
            stopCamera();
            Toast.makeText(this, R.string.camera_failed, Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void stopCamera() {
        if (camera == null) return;
        camera.setPreviewCallbackWithBuffer(null);
        camera.stopPreview();
        camera.release();
        camera = null;
    }

    private static int backCamera() {
        Camera.CameraInfo info = new Camera.CameraInfo();
        for (int i = 0; i < Camera.getNumberOfCameras(); i++) {
            Camera.getCameraInfo(i, info);
            if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) return i;
        }
        return 0; // only a front camera: better than nothing
    }

    // Big enough to read a code across the room, small enough to decode quickly.
    private static Camera.Size pickSize(List<Camera.Size> sizes) {
        Camera.Size best = sizes.get(0);
        for (Camera.Size s : sizes) {
            if (Math.abs(s.width * s.height - 1280 * 720) < Math.abs(best.width * best.height - 1280 * 720)) best = s;
        }
        return best;
    }

    private int displayRotation() {
        Camera.CameraInfo info = new Camera.CameraInfo();
        Camera.getCameraInfo(cameraId, info);
        int degrees;
        switch (getWindowManager().getDefaultDisplay().getRotation()) {
            case Surface.ROTATION_90: degrees = 90; break;
            case Surface.ROTATION_180: degrees = 180; break;
            case Surface.ROTATION_270: degrees = 270; break;
            default: degrees = 0;
        }
        return (info.orientation - degrees + 360) % 360;
    }

    // Fill the screen without stretching the picture.
    private void fitPreview(boolean turned) {
        float vw = view.getWidth();
        float vh = view.getHeight();
        if (vw == 0 || vh == 0) return;
        float pw = turned ? previewHeight : previewWidth;
        float ph = turned ? previewWidth : previewHeight;
        float scale = Math.max(vw / pw, vh / ph);
        Matrix m = new Matrix();
        m.setScale(pw * scale / vw, ph * scale / vh, vw / 2, vh / 2);
        view.setTransform(m);
    }

    @Override
    public void onPreviewFrame(byte[] data, Camera cam) {
        if (done || busy) {
            cam.addCallbackBuffer(data);
            return;
        }
        busy = true;
        final int w = previewWidth;
        final int h = previewHeight;
        decoder.post(() -> {
            String text = decode(data, w, h);
            busy = false;
            runOnUiThread(() -> {
                if (text != null && !done) {
                    done = true;
                    setResult(RESULT_OK, new Intent().putExtra(EXTRA_TEXT, text));
                    finish();
                } else if (camera == cam) {
                    cam.addCallbackBuffer(data);
                }
            });
        });
    }

    // Looks in the middle of the picture, where the code is held.
    String decode(byte[] yuv, int w, int h) {
        int side = Math.min(w, h) * 4 / 5;
        try {
            PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(
                    yuv, w, h, (w - side) / 2, (h - side) / 2, side, side, false);
            Result r = reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(source)));
            return r.getText();
        } catch (Exception e) {
            return null;
        } finally {
            reader.reset();
        }
    }

    @Override
    public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
        startCamera();
    }

    @Override
    public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {
        if (camera != null) fitPreview(displayRotation() % 180 != 0);
    }

    @Override
    public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) {
        stopCamera();
        return true;
    }

    @Override
    public void onSurfaceTextureUpdated(SurfaceTexture surface) {
    }
}
