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
 */
class DeviceKey {

    private static final String ALIAS = "ayva-device";
    private static final String PREFIX = "ayva-device-proof:";

    interface OriginCheck {
        boolean allowed();
    }

    private final OriginCheck originCheck;

    DeviceKey(OriginCheck originCheck) {
        this.originCheck = originCheck;
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
        if (!originCheck.allowed()) throw new SecurityException("origin");
        PublicKey key = store().getCertificate(ALIAS).getPublicKey();
        return Base64.encodeToString(key.getEncoded(), Base64.NO_WRAP);
    }

    /** Base64 DER ECDSA signature; only for Ayva challenges. */
    @JavascriptInterface
    public String sign(String message) throws Exception {
        if (!originCheck.allowed() || message == null || !message.startsWith(PREFIX)) {
            throw new SecurityException("refused");
        }
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
