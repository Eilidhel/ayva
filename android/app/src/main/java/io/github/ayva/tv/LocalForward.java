package io.github.ayva.tv;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;

/**
 * Passes connections from 127.0.0.1 on this phone to the computer on the home
 * network, byte for byte. The player opens the computer's page through it, so
 * WebView sees http://127.0.0.1:<port>: a "secure" address, where the page may
 * use the microphone (it may not on plain http://192.168…). Listens on this
 * phone only; it reaches nothing but the one computer it was made for.
 */
class LocalForward {

    private final String host;
    private final int port;
    private ServerSocket server;

    LocalForward(String host, int port) {
        this.host = host;
        this.port = port;
    }

    /**
     * Starts listening, on the computer's own port when it is free (so the
     * page keeps the same address, and its stored data, from one visit to the
     * next). Returns the local port.
     */
    int start() throws IOException {
        InetAddress local = InetAddress.getByName("127.0.0.1");
        try {
            server = new ServerSocket();
            server.setReuseAddress(true);
            server.bind(new InetSocketAddress(local, port), 16);
        } catch (IOException e) {
            server = new ServerSocket(0, 16, local);
        }
        Thread accept = new Thread(() -> {
            while (!server.isClosed()) {
                try {
                    Socket client = server.accept();
                    new Thread(() -> handle(client)).start();
                } catch (IOException e) {
                    return;
                }
            }
        }, "local-forward");
        accept.setDaemon(true);
        accept.start();
        return server.getLocalPort();
    }

    void stop() {
        try {
            if (server != null) server.close();
        } catch (IOException ignored) {
        }
    }

    private void handle(Socket client) {
        Socket up = new Socket();
        try {
            up.connect(new InetSocketAddress(host, port), 10000);
            up.setTcpNoDelay(true);
            client.setTcpNoDelay(true);
            Thread back = new Thread(() -> pipe(up, client));
            back.start();
            pipe(client, up);
        } catch (IOException e) {
            close(client);
            close(up);
        }
    }

    private static void pipe(Socket from, Socket to) {
        byte[] buf = new byte[32 * 1024];
        try {
            InputStream in = from.getInputStream();
            OutputStream out = to.getOutputStream();
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                out.flush();
            }
        } catch (IOException ignored) {
        } finally {
            close(from);
            close(to);
        }
    }

    private static void close(Socket s) {
        try {
            s.close();
        } catch (IOException ignored) {
        }
    }
}
