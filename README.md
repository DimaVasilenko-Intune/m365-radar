# m365-radar

An MCP server and an open daily dataset for the **Microsoft 365 roadmap** and **Azure service status**.

Point an AI agent at it and ask what is coming for Intune next quarter, what changed on the roadmap this week, or whether Azure is currently degraded — without anyone opening a browser.

## Why a snapshot instead of a live proxy

The roadmap API is undocumented, bot-protected and about 2 MB per request. Querying it on every tool call would be slow and fragile, so this repo does it the other way round:

1. A GitHub Action harvests the roadmap **once a day** and commits a normalised snapshot to `data/`.
2. The MCP server answers queries from that snapshot — fast, offline-capable, and unaffected if the upstream endpoint has a bad day.
3. The **git history becomes the changelog**. The diff between two daily commits is exactly what Microsoft changed on the roadmap, with nothing else in it.

That last point is the radar. `git log -p data/roadmap.json` is a complete, auditable record of roadmap movement over time.

## Tools

| Tool | What it does |
|---|---|
| `search_roadmap` | Free-text search with filters for product, status, cloud instance and platform |
| `get_roadmap_item` | Full detail for one feature ID |
| `list_recent_changes` | Features added or updated in the last N days — newest first |
| `get_azure_status` | Active Azure incidents, read live from the public status feed |

Statuses are `In development`, `Rolling out`, `Launched` and `Cancelled`. Cloud instances are `Worldwide (Standard Multi-Tenant)`, `GCC`, `GCC High` and `DoD`.

## Use it with Claude Code

```bash
git clone https://github.com/DimaVasilenko-Intune/m365-radar.git
cd m365-radar
npm install
npm run harvest   # fetch the first snapshot
npm run build
claude mcp add m365-radar -- node "$(pwd)/dist/server.js"
```

Any other MCP client works the same way — it is a plain stdio server:

```json
{
  "mcpServers": {
    "m365-radar": {
      "command": "node",
      "args": ["/absolute/path/to/m365-radar/dist/server.js"]
    }
  }
}
```

## The dataset

`data/roadmap.json` is a normalised array of every published roadmap feature, sorted by ID with a fixed key order so diffs stay clean. `data/meta.json` records when it was harvested and the full product, platform and cloud-instance taxonomy.

Each feature carries `id`, `title`, `description`, `status`, `products`, `cloudInstances`, `platforms`, `releasePhases`, `previewDate`, `generalAvailabilityDate`, `created`, `modified`, `moreInfoLink` and a `url` deep link.

The data is Microsoft's; this repo only reshapes it. Use it for whatever you like.

## Data sources

| Source | Endpoint |
|---|---|
| Microsoft 365 roadmap | `https://www.microsoft.com/releasecommunications/api/v1/m365` |
| Azure status | `https://azure.status.microsoft/en-us/status/feed/` |

**Be aware:** the roadmap endpoint is not a documented, supported API. It returns `403` unless the request carries a browser `User-Agent`, and Microsoft can change or withdraw it without notice. The snapshot design means a bad upstream day costs you freshness, not availability — the harvest refuses to overwrite a good snapshot with an empty or malformed response.

No tenant data, no authentication and no Microsoft Graph calls are involved anywhere in this project. Everything here is public information.

## Development

```bash
npm run harvest   # refresh data/ from upstream
npm run dev       # run the server from source
npm run build     # compile to dist/
```

## License

MIT © Dima Vasilenko
