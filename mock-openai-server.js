const fs = require("fs");
const http = require("http");

const outputPath = "C:\\Users\\NgcoboT\\Downloads\\CustomGPT\\mock-openai-request.json";

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });
  req.on("end", () => {
    fs.writeFileSync(outputPath, body, "utf8");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write('data: {"choices":[{"delta":{"content":"mock ok"}}]}\n\n');
    res.write("data: [DONE]\n\n");
    res.end();
    server.close();
  });
});

server.listen(8011, "127.0.0.1");
