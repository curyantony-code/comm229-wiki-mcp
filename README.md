# comm229-wiki-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes a local markdown wiki as tools for LLM agents.

## Installation

```bash
npm install -g comm229-wiki-mcp
```

Or use directly with `npx` (no install needed).

## Usage

Point it at any directory containing markdown files:

```bash
# CLI argument
comm229-wiki-mcp /path/to/your/wiki

# Environment variable
WIKI_ROOT=/path/to/your/wiki comm229-wiki-mcp
```

## Wiring into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "my-wiki": {
      "command": "npx",
      "args": ["comm229-wiki-mcp", "/absolute/path/to/your/wiki"]
    }
  }
}
```

Or via environment variable:

```json
{
  "mcpServers": {
    "my-wiki": {
      "command": "npx",
      "args": ["comm229-wiki-mcp"],
      "env": { "WIKI_ROOT": "/absolute/path/to/your/wiki" }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `wiki_index` | Read `index.md` — the master catalog |
| `wiki_read` | Read any page by relative path (e.g. `sources/week1.md`) |
| `wiki_list` | List pages in `sources/`, `concepts/`, `entities/`, or root |
| `wiki_search` | Full-text search across all `.md` files |
| `wiki_write` | Write or overwrite any wiki page |
| `wiki_log` | Append a structured entry to `log.md` |

## Wiki Structure

The server works with any flat or structured directory of markdown files. It was designed for a course wiki with this layout:

```
wiki/
  index.md
  log.md
  overview.md
  sources/
  concepts/
  entities/
```

## License

MIT
