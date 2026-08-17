import { GoogleGenAI } from "@google/genai";

// News article information received from page.tsx.
type Article = {
  title?: string;
  summary?: string;
  source?: string;
  url?: string;
  publishedAt?: string;
};

// This route sends the question and news context to Gemini.
export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    const model =
      process.env.AI_MODEL || "gemini-3.5-flash-lite";

    if (!apiKey) {
      return Response.json(
        {
          error:
            "GEMINI_API_KEY is missing from the .env file.",
        },
        {
          status: 500,
        }
      );
    }

    const body = await request.json();

    const question =
      typeof body.question === "string"
        ? body.question.trim()
        : "";

    const articles: Article[] = Array.isArray(body.articles)
      ? body.articles.slice(0, 8)
      : [];

    if (!question) {
      return Response.json(
        {
          error: "Please enter a question.",
        },
        {
          status: 400,
        }
      );
    }

    if (question.length > 1000) {
      return Response.json(
        {
          error: "The question is too long.",
        },
        {
          status: 400,
        }
      );
    }

    if (articles.length === 0) {
      return Response.json(
        {
          error:
            "No news articles were supplied to the chatbot.",
        },
        {
          status: 400,
        }
      );
    }

    // Convert current articles into controlled text context.
    const newsContext = articles
      .map((article, index) => {
        return `
ARTICLE ${index + 1}

Title:
${article.title || "Unknown"}

Publisher:
${article.source || "Unknown"}

Published:
${article.publishedAt || "Unknown"}

Summary:
${(article.summary || "Unavailable").slice(0, 1000)}

Source URL:
${article.url || "Unavailable"}
`;
      })
      .join("\n");

    // Create a Gemini client using the server-side API key.
    const ai = new GoogleGenAI({
      apiKey,
    });

    const prompt = `
You are WorldBrief, a careful worldwide-news assistant.

RULES:
- Answer only from the supplied news articles.
- Do not invent facts, events, quotations, dates or sources.
- Mention the publisher when stating an important fact.
- Finish with a "Sources" section containing relevant original URLs.
- Clearly say if the supplied articles cannot answer the question.
- Keep the answer clear and concise.

USER QUESTION:

${question}

CURRENT NEWS ARTICLES:

${newsContext}
`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    const answer = response.text?.trim();

    if (!answer) {
      return Response.json(
        {
          error:
            "Gemini completed the request but returned no text.",
        },
        {
          status: 502,
        }
      );
    }

    return Response.json({
      answer,
    });
  } catch (error) {
    console.error("Complete Gemini error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "The Gemini request failed.";

    return Response.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}