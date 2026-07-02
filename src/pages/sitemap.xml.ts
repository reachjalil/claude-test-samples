import type { APIRoute } from "astro";
import { examBanks } from "../data/examBank";

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL("https://sampleclaudeexams.com");
  const questionPaths = Array.from(
    new Set(
      examBanks.flatMap((bank) =>
        bank.questions.map(
          (question) => `/questions/${question.id.toLowerCase()}/`
        )
      )
    )
  );
  const urls = [
    "/",
    "/exam/",
    "/path/",
    "/about/",
    "/disclaimer/",
    "/privacy/",
    "/terms/",
    "/questions/",
    ...questionPaths,
  ].map((path) => new URL(path, base).toString());

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((url) => `  <url><loc>${url}</loc></url>`)
      .join("\n")}\n</urlset>\n`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    }
  );
};
