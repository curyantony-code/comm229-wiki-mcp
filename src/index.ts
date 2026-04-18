import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const WIKI_ROOT = (() => {
  const root = process.argv[2] || process.env.WIKI_ROOT;
  if (!root) {
    process.stderr.write(
      "Error: provide wiki path as first argument or WIKI_ROOT env var\n" +
      "  Usage: comm229-wiki-mcp /path/to/wiki\n" +
      "  Or:    WIKI_ROOT=/path/to/wiki comm229-wiki-mcp\n"
    );
    process.exit(1);
  }
  return path.resolve(root);
})();

function wikiPath(relative: string): string {
  const resolved = path.resolve(WIKI_ROOT, relative);
  if (!resolved.startsWith(WIKI_ROOT)) {
    throw new Error("Path traversal denied");
  }
  return resolved;
}

async function readPage(relative: string): Promise<string> {
  const content = await fs.readFile(wikiPath(relative), "utf-8");
  return content;
}

async function writePage(relative: string, content: string): Promise<void> {
  const target = wikiPath(relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf-8");
}

async function listCategory(category: "sources" | "concepts" | "entities" | ""): Promise<string[]> {
  const dir = category ? wikiPath(category) : WIKI_ROOT;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => (category ? `${category}/${e.name}` : e.name));
}

async function searchWiki(query: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("grep", [
      "-r",
      "-i",
      "-l",
      "--include=*.md",
      query,
      WIKI_ROOT,
    ]);
    const files = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((f) => path.relative(WIKI_ROOT, f));
    if (files.length === 0) return "No matches found.";

    const snippets: string[] = [];
    for (const file of files.slice(0, 10)) {
      const { stdout: lines } = await execFileAsync("grep", [
        "-i",
        "-n",
        "-m",
        "3",
        query,
        wikiPath(file),
      ]);
      snippets.push(`### ${file}\n${lines.trim()}`);
    }
    return snippets.join("\n\n");
  } catch {
    return "No matches found.";
  }
}

async function appendLog(entry: string): Promise<void> {
  const logPath = wikiPath("log.md");
  let existing = "";
  try {
    existing = await fs.readFile(logPath, "utf-8");
  } catch {}
  await fs.writeFile(logPath, existing + "\n" + entry + "\n", "utf-8");
}

const server = new Server(
  { name: "comm229-wiki", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "wiki_index",
      description: "Read the wiki index (index.md). Use this first to orient before drilling into pages.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "wiki_read",
      description: "Read any wiki page by relative path (e.g. 'sources/wk3-hr-laws.md', 'concepts/motivation-theories.md', 'overview.md').",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from wiki root" },
        },
        required: ["path"],
      },
    },
    {
      name: "wiki_list",
      description: "List pages in a category: 'sources', 'concepts', 'entities', or '' for root-level files.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["sources", "concepts", "entities", ""],
            description: "Category directory to list",
          },
        },
        required: ["category"],
      },
    },
    {
      name: "wiki_search",
      description: "Full-text search across all wiki markdown files. Returns file names and matching line snippets.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term or phrase" },
        },
        required: ["query"],
      },
    },
    {
      name: "wiki_write",
      description: "Write or overwrite a wiki page. Use this to create or update source, concept, entity, or overview pages.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from wiki root (e.g. 'concepts/motivation-theories.md')" },
          content: { type: "string", description: "Full markdown content of the page" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "wiki_log",
      description: "Append a structured entry to log.md. Provide the full formatted entry following the log schema.",
      inputSchema: {
        type: "object",
        properties: {
          entry: { type: "string", description: "Log entry text (## [YYYY-MM-DD] type | title ...)" },
        },
        required: ["entry"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      case "wiki_index": {
        const content = await readPage("index.md");
        return { content: [{ type: "text", text: content }] };
      }

      case "wiki_read": {
        const content = await readPage(args!.path as string);
        return { content: [{ type: "text", text: content }] };
      }

      case "wiki_list": {
        const files = await listCategory(args!.category as "sources" | "concepts" | "entities" | "");
        return { content: [{ type: "text", text: files.join("\n") }] };
      }

      case "wiki_search": {
        const results = await searchWiki(args!.query as string);
        return { content: [{ type: "text", text: results }] };
      }

      case "wiki_write": {
        await writePage(args!.path as string, args!.content as string);
        return { content: [{ type: "text", text: `Written: ${args!.path}` }] };
      }

      case "wiki_log": {
        await appendLog(args!.entry as string);
        return { content: [{ type: "text", text: "Log entry appended." }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
