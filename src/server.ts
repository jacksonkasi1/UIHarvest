import express from "express";
import path from "path";
import { exec } from "child_process";

export function startServer(data: any, outputDir: string, rootDir: string) {
  const app = express();
  const PORT = 3333;

  app.use("/output", express.static(outputDir));
  app.use(express.static(path.join(rootDir, "public")));

  app.get("/api/design-system", (_req, res) => {
    res.json(data);
  });

  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n🎨  Design Explorer → ${url}\n`);
    const cmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    exec(`${cmd} ${url}`);
  });
}
