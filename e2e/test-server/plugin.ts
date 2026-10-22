// Stand-in for the Streamyfin Jellyfin plugin: answers GET /Streamyfin/config
// with the test Seerr's address, and passes every other request, the /socket
// websocket included, to the test Jellyfin unchanged.
const UPSTREAM = process.env.UPSTREAM ?? "http://jellyfin:8096";
const config = {
  settings: {
    seerr: {
      serverUrl: {
        value: process.env.SEERR_PUBLIC_URL ?? "http://127.0.0.1:15155",
        locked: false,
      },
      autoLogin: { value: true, locked: false },
    },
  },
};

type Pipe = {
  upstream?: WebSocket;
  queue: (string | ArrayBuffer | Uint8Array)[];
  target: string;
};

Bun.serve<Pipe>({
  port: 8096,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.toLowerCase() === "/streamyfin/config") {
      return Response.json(config);
    }
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const target = UPSTREAM.replace("http", "ws") + url.pathname + url.search;
      if (server.upgrade(req, { data: { queue: [], target } })) return;
      return new Response("upgrade failed", { status: 400 });
    }
    const headers = new Headers(req.headers);
    headers.delete("host");
    const res = await fetch(UPSTREAM + url.pathname + url.search, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method)
        ? undefined
        : await req.arrayBuffer(),
      redirect: "manual",
    });
    // fetch has decoded the body already; passing its encoding on would have
    // the app decode it a second time.
    const out = new Headers(res.headers);
    out.delete("content-encoding");
    out.delete("content-length");
    return new Response(res.body, { status: res.status, headers: out });
  },
  websocket: {
    open(ws) {
      const upstream = new WebSocket(ws.data.target);
      ws.data.upstream = upstream;
      upstream.onopen = () => {
        for (const m of ws.data.queue) upstream.send(m);
        ws.data.queue = [];
      };
      upstream.onmessage = (e) => ws.send(e.data as string);
      upstream.onclose = () => ws.close();
      upstream.onerror = () => ws.close();
    },
    message(ws, message) {
      const up = ws.data.upstream;
      if (up && up.readyState === WebSocket.OPEN) up.send(message);
      else ws.data.queue.push(message);
    },
    close(ws) {
      ws.data.upstream?.close();
    },
  },
});
