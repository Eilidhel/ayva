package io.github.ayva.tv;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * A small proxy inside the app, used only for the fixed address. Some networks
 * cut every connection whose TLS greeting (ClientHello) names a *.workers.dev
 * address. Chrome gets past that with Encrypted Client Hello, which WebView
 * lacks. This proxy passes the page's connections through unchanged, except
 * that it sends the greeting as two TLS records, split in the middle of the
 * name, so a filter looking at one record cannot read it. Encryption is not
 * touched: the proxy never sees what the page sends or receives.
 *
 * It listens on 127.0.0.1 only and accepts nothing but CONNECT to the one
 * address the player shows, so other apps cannot use it to reach anything else.
 */
class SplitProxy {

    private final String host;
    private ServerSocket server;

    SplitProxy(String host) {
        this.host = host;
    }

    /** Starts listening; returns the port. */
    int start() throws IOException {
        server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        Thread accept = new Thread(() -> {
            while (!server.isClosed()) {
                try {
                    Socket client = server.accept();
                    new Thread(() -> handle(client)).start();
                } catch (IOException e) {
                    return;
                }
            }
        }, "split-proxy");
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
        Socket up = null;
        try {
            client.setSoTimeout(30000);
            InputStream in = client.getInputStream();
            OutputStream out = client.getOutputStream();
            String[] request = readHeader(in).split(" ");
            if (request.length < 2 || !"CONNECT".equals(request[0])
                    || !request[1].equalsIgnoreCase(host + ":443")) {
                out.write("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                return;
            }
            up = new Socket();
            up.connect(new InetSocketAddress(host, 443), 15000);
            up.setTcpNoDelay(true);
            out.write("HTTP/1.1 200 Connection Established\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            out.flush();
            client.setSoTimeout(0);
            sendGreeting(in, up.getOutputStream());
            final Socket upstream = up;
            Thread back = new Thread(() -> pipe(upstream, client));
            back.start();
            pipe(client, upstream);
        } catch (IOException ignored) {
        } finally {
            close(client);
            close(up);
        }
    }

    // The request line of "CONNECT host:443 HTTP/1.1", reading no further than the blank line.
    private static String readHeader(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        int matched = 0;
        while (sb.length() < 8192) {
            int c = in.read();
            if (c < 0) throw new IOException("closed");
            sb.append((char) c);
            matched = (c == (matched % 2 == 0 ? '\r' : '\n')) ? matched + 1 : (c == '\r' ? 1 : 0);
            if (matched == 4) return sb.substring(0, sb.indexOf("\r\n"));
        }
        throw new IOException("header too long");
    }

    private void sendGreeting(InputStream in, OutputStream up) throws IOException {
        byte[] head = readFully(in, 5);
        if (head[0] != 0x16) { // not a TLS handshake: pass through as it is
            up.write(head);
            return;
        }
        int length = ((head[3] & 0xff) << 8) | (head[4] & 0xff);
        byte[] body = readFully(in, length);
        int at = indexOf(body, host.getBytes(StandardCharsets.US_ASCII));
        int cut = at >= 0 ? at + host.length() / 2 : Math.min(40, length / 2);
        if (cut <= 0 || cut >= length) {
            up.write(head);
            up.write(body);
            return;
        }
        up.write(record(head, body, 0, cut));
        up.flush();
        up.write(record(head, body, cut, length));
        up.flush();
    }

    private static byte[] record(byte[] head, byte[] body, int from, int to) {
        int n = to - from;
        byte[] r = new byte[5 + n];
        r[0] = head[0];
        r[1] = head[1];
        r[2] = head[2];
        r[3] = (byte) (n >> 8);
        r[4] = (byte) n;
        System.arraycopy(body, from, r, 5, n);
        return r;
    }

    private static int indexOf(byte[] data, byte[] part) {
        outer:
        for (int i = 0; i + part.length <= data.length; i++) {
            for (int j = 0; j < part.length; j++) {
                if (data[i + j] != part[j]) continue outer;
            }
            return i;
        }
        return -1;
    }

    private static byte[] readFully(InputStream in, int n) throws IOException {
        byte[] buf = new byte[n];
        int got = 0;
        while (got < n) {
            int r = in.read(buf, got, n - got);
            if (r < 0) throw new IOException("closed");
            got += r;
        }
        return buf;
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
            if (s != null) s.close();
        } catch (IOException ignored) {
        }
    }
}
