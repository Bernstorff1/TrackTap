const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT) || 5173;
const root = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0] || "/");
    const normalized = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
    if (normalized === "/playlist" || normalized === "/playlist/") {
      serveFile(res, path.join(root, "playlist.html"));
      return;
    }
    const requested = normalized === "/" ? "/index.html" : normalized;
    const filePath = path.join(root, requested);

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isFile()) {
        serveFile(res, filePath);
        return;
      }
      serveFile(res, path.join(root, "index.html"));
    });
  })
  .listen(port, () => {
    console.log(`Tapster dev server running on http://localhost:${port}`);
  });
