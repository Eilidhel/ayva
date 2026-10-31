package io.github.ayva.tv;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;

/**
 * The device key the computer uses to recognise this device (window.AyvaKey,
 * used by public/devicekey.js). The private key lives in the Android Keystore
 * and can never be read out, not even by this app; it only signs the
 * computer's one-time challenges, and only for the page this app opened.
 *
 * Every signature names the address the app is showing, filled in here and
 * not by the page. A page somewhere else (a link someone sent) can still ask
 * for a signature, but it names that other address, which the computer
 * refuses, so it cannot be used to pose as this device.
 */
class DeviceKey {

    private static final String ALIAS = "ayva-device";
    private static final String PREFIX = "ayva-device-proof:";

    interface OriginSource {
        /** The address of the page this app opened, or null if it has left it. */
        String origin();
    }

    private final OriginSource originSource;

    DeviceKey(OriginSource originSource) {
        this.originSource = originSource;
    }

    static boolean supported() {
        return Build.VERSION.SDK_INT >= 23;
    }

    private KeyStore store() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyPairGenerator gen = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            gen.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build());
            gen.generateKeyPair();
        }
        return ks;
    }

    /** Base64 SPKI public key. */
    @JavascriptInterface
    public String publicKey() throws Exception {
        if (originSource.origin() == null) throw new SecurityException("origin");
        PublicKey key = store().getCertificate(ALIAS).getPublicKey();
        return Base64.encodeToString(key.getEncoded(), Base64.NO_WRAP);
    }

    /** Base64 DER ECDSA signature of "ayva-device-proof:<origin>:<nonce>". */
    @JavascriptInterface
    public String signProof(String nonce) throws Exception {
        String origin = originSource.origin();
        if (origin == null || nonce == null || !nonce.matches("[0-9a-f]{16,128}")) {
            throw new SecurityException("refused");
        }
        // Lower case, as browsers write it (location.origin).
        return sign(PREFIX + origin.toLowerCase(java.util.Locale.ROOT) + ":" + nonce);
    }

    private String sign(String message) throws Exception {
        Signature sig = Signature.getInstance("SHA256withECDSA");
        sig.initSign((PrivateKey) store().getKey(ALIAS, null));
        sig.update(message.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(sig.sign(), Base64.NO_WRAP);
    }

    /** Hex SHA-256, for the PIN on plain-http pages that lack WebCrypto. */
    @JavascriptInterface
    public String sha256(String text) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : hash) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
