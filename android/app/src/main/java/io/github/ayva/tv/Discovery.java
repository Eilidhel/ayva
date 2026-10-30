package io.github.ayva.tv;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketTimeoutException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Finds Ayva computers on the local network: broadcasts a UDP request
 * and collects the replies the server sends back (see server.js "LAN discovery").
 */
class Discovery {

    static final int PORT = 41234;
    static final String REQUEST = "AYVA_DISCOVER";
    static final long STALE_MS = 6000;

    static class Host {
        String name;
        String address;
        int port;
        String code;
        boolean live;
        long lastSeen;

        String key() {
            return address + ":" + port;
        }
    }

    interface Listener {
        void onHostsChanged(List<Host> hosts);
    }

    private final Context context;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Host> hosts = new LinkedHashMap<>();
    private volatile boolean running;
    private Thread thread;
    private WifiManager.MulticastLock lock;

    Discovery(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    void start() {
        if (running) return;
        running = true;
        // Some devices drop broadcast traffic unless a multicast lock is held.
        WifiManager wifi = (WifiManager) context.getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            lock = wifi.createMulticastLock("ayva");
            lock.setReferenceCounted(false);
            lock.acquire();
        }
        thread = new Thread(this::loop, "discovery");
        thread.start();
    }

    void stop() {
        running = false;
        if (thread != null) thread.interrupt();
        if (lock != null && lock.isHeld()) lock.release();
    }

    private void loop() {
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            socket.setBroadcast(true);
            socket.setSoTimeout(300);
            byte[] request = REQUEST.getBytes(Charset.forName("UTF-8"));
            byte[] buf = new byte[8192];
            long nextSend = 0;

            while (running) {
                long now = System.currentTimeMillis();
                if (now >= nextSend) {
                    for (InetAddress target : broadcastAddresses()) {
                        try {
                            socket.send(new DatagramPacket(request, request.length, target, PORT));
                        } catch (Exception ignored) {
                        }
                    }
                    nextSend = now + 1500;
                    pruneAndPublish(false);
                }
                try {
                    DatagramPacket packet = new DatagramPacket(buf, buf.length);
                    socket.receive(packet);
                    String text = new String(packet.getData(), 0, packet.getLength(), Charset.forName("UTF-8"));
                    handleReply(text, packet.getAddress().getHostAddress());
                } catch (SocketTimeoutException ignored) {
                }
            }
        } catch (Exception e) {
            // Socket failed (no network); try again shortly.
            if (running) main.postDelayed(() -> { if (running) { running = false; start(); } }, 2000);
        } finally {
            if (socket != null) socket.close();
        }
    }

    private void handleReply(String text, String address) {
        try {
            JSONObject json = new JSONObject(text);
            if (!"ayva".equals(json.optString("app"))) return;
            JSONArray rooms = json.optJSONArray("rooms");
            Host host = new Host();
            host.name = json.optString("name", address);
            host.address = address;
            host.port = json.optInt("port", 3000);
            host.lastSeen = System.currentTimeMillis();
            // Prefer a room that is live; otherwise any room (the computer may start sharing later).
            if (rooms != null) {
                for (int i = 0; i < rooms.length(); i++) {
                    JSONObject room = rooms.getJSONObject(i);
                    if (host.code == null || (room.optBoolean("live") && !host.live)) {
                        host.code = room.optString("code");
                        host.live = room.optBoolean("live");
                    }
                }
            }
            synchronized (hosts) {
                hosts.put(host.key(), host);
            }
            pruneAndPublish(true);
        } catch (Exception ignored) {
        }
    }

    private void pruneAndPublish(boolean changed) {
        long now = System.currentTimeMillis();
        final List<Host> list;
        synchronized (hosts) {
            List<String> stale = new ArrayList<>();
            for (Map.Entry<String, Host> e : hosts.entrySet()) {
                if (now - e.getValue().lastSeen > STALE_MS) stale.add(e.getKey());
            }
            for (String key : stale) hosts.remove(key);
            if (!changed && stale.isEmpty()) return;
            list = new ArrayList<>(hosts.values());
        }
        main.post(() -> listener.onHostsChanged(Collections.unmodifiableList(list)));
    }

    private static List<InetAddress> broadcastAddresses() {
        List<InetAddress> out = new ArrayList<>();
        try {
            out.add(InetAddress.getByName("255.255.255.255"));
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                for (InterfaceAddress addr : nif.getInterfaceAddresses()) {
                    InetAddress b = addr.getBroadcast();
                    if (b != null && !out.contains(b)) out.add(b);
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }
}
