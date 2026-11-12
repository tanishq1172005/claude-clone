import OpenAI from "openai";
import type {
  Provider,
  StopReason,
  Message,
  ContentBlock,
  Usage,
} from "../types.ts";

function toOpenAI(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((m): OpenAI.ChatCompletionMessageParam => {
    if (m.role === "user") {
      return {
        role: "user",
        content: m.content,
      };
    }

    if (m.role === "assistant") {
      const text = m.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      const toolCalls = m.content
        .filter((b) => b.type === "toolCall")
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: {
            name: b.name,
            arguments: JSON.stringify(b.arguments),
          },
        }));

      return {
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
    }

    // Tool results must be sent as tool messgesa
    return {
      role: "tool",
      tool_call_id: m.toolCallId,
      content: m.content,
    };
  });
}

export function createOpenAICompat(
  name: string,
  baseURL: string,
  apiKey: string,
  defaultModel: string,
): Provider {
  const client = new OpenAI({
    baseURL,
    apiKey,
  });

  return {
    name,
    model:defaultModel,

    async *stream({
      messages,
      model,
      system,
      tools = [],
    }) {
      const chat = toOpenAI(messages);

      const stream = await client.chat.completions.create({
        model,
        stream: true,
        stream_options: {
          include_usage: true,
        },

        messages: [
          ...(system
            ? [{ role: "system" as const, content: system }]
            : []),
          ...chat,
        ],

        ...(tools.length > 0
          ? {
              tools: tools.map((t) => ({
                type: "function" as const,
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                },
              })),
            }
          : {}),
      });

      let usage: Usage = {
        input: 0,
        output: 0,
      };

      let stopReason: StopReason = "stop";

      const content: ContentBlock[] = [];

      // OpenAI streams tool calls by index.
      const toolCalls = new Map<
        number,
        {
          id: string;
          name: string;
          arguments: string;
        }
      >();

      for await (const chunk of stream) {
        const choice = chunk.choices[0];

        if (chunk.usage) {
          usage = {
            input: chunk.usage.prompt_tokens,
            output: chunk.usage.completion_tokens,
          };
        }

        if (!choice) continue;

        const delta = choice.delta;

        // Text streaming
        if (delta.content) {
          let block = content.at(-1);

          if (!block || block.type !== "text") {
            block = {
              type: "text",
              text: "",
            };

            content.push(block);
          }

          block.text += delta.content;

          yield {
            type: "text_delta",
            delta: delta.content,
          };
        }

        // Tool call streaming
        for (const tool of delta.tool_calls ?? []) {
          const index = tool.index;

          let current = toolCalls.get(index);

          if (!current) {
            current = {
              id: "",
              name: "",
              arguments: "",
            };

            toolCalls.set(index, current);
          }

          if (tool.id) {
            current.id = tool.id;
          }

          if (tool.function?.name) {
            current.name += tool.function.name;
          }

          if (tool.function?.arguments) {
            current.arguments += tool.function.arguments;
          }
        }

        // Stop reason
        if (choice.finish_reason === "length") {
          stopReason = "length";
        } else if (choice.finish_reason === "tool_calls") {
          stopReason = "toolUse";
        } else if (choice.finish_reason === "stop") {
          stopReason = "stop";
        }
      }

      // Convert accumulated tool calls into internal ContentBlocks
      for (const tool of toolCalls.values()) {
        content.push({
          type: "toolCall",
          id: tool.id,
          name: tool.name,
          arguments: tool.arguments
            ? JSON.parse(tool.arguments)
            : {},
        });
      }

      yield {
        type: "done",
        message: {
          role: "assistant",
          content,
          usage,
          stopReason,
        },
      };
    },
  };
}
