/* AI-assisted: this file was written with help from Claude (Anthropic), directed and reviewed by Team Pheonix. See AI-DISCLOSURE.md. */
// Tiny local web server for testing: node tools/serve.js  ->  http://localhost:8080
// Supports Range requests so audio can be seeked (like GitHub Pages).
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".mp3": "audio/mpeg" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("Not found"); }
    const type = types[path.extname(file)] || "application/octet-stream";
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? +range[1] : 0, end = range[2] ? +range[2] : st.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "no-store" });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type + (type.startsWith("text") ? "; charset=utf-8" : ""), "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}).listen(process.env.PORT || 8080, function () { console.log("Game running at http://localhost:" + this.address().port); });
