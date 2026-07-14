import { readFileSync } from "fs";
import { join } from "path";

export function GET() {
  const html = readFileSync(
    join(process.cwd(), "public/register/index.html"),
    "utf8",
  );
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
