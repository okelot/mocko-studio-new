import test from "node:test";
import assert from "node:assert/strict";
import { generateArticle } from "../lib/content";

test("generateArticle sends article prompts and parses the model response", async () => {
  const calls: unknown[] = [];
  const article = {
    title: "PTE Respond to a Situation: Complete Practice Guide",
    metaDescription: "Practice PTE Respond to a Situation with clear examples, structure, and scoring tips.",
    markdown: "# PTE Respond to a Situation\n\n## How to answer\n\nUse a clear, polite structure.",
  };

  const result = await generateArticle(
    "PTE Respond to a Situation",
    "pte respond to a situation",
    "Write in a practical Mocko.ai coaching voice.",
    "openai:gpt-5.4",
    {
      openai: {
        responses: {
          create: async (params) => {
            calls.push(params);
            return { output_text: JSON.stringify(article) };
          },
        },
      },
    },
  );

  assert.deepEqual(result, article);
  assert.equal(calls.length, 1);

  const request = calls[0] as {
    model?: string;
    input?: Array<{ role: string; content: string }>;
    text?: { format?: { type?: string; schema?: { required?: string[] } } };
  };

  assert.equal(request.model, "gpt-5.4");
  assert.equal(request.input?.[0]?.role, "system");
  assert.match(request.input?.[0]?.content ?? "", /Mocko\.ai coaching voice/);
  assert.equal(request.input?.[1]?.role, "user");
  assert.match(request.input?.[1]?.content ?? "", /PTE Respond to a Situation/);
  assert.match(request.input?.[1]?.content ?? "", /pte respond to a situation/);
  assert.equal(request.text?.format?.type, "json_schema");
  assert.deepEqual(request.text?.format?.schema?.required, ["title", "metaDescription", "markdown"]);
});

test("generateArticle rejects invalid article JSON", async () => {
  await assert.rejects(
    () =>
      generateArticle("PTE", "pte", "", "openai:gpt-5.4", {
        openai: {
          responses: {
            create: async () => ({ output_text: "not json" }),
          },
        },
      }),
    /OpenAI returned article content that was not valid JSON/,
  );
});
