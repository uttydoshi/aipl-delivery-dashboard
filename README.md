# AI Platform Control Center

Engineering dashboards for the AI Platform team — delivery metrics, LLM model usage, and more.

## Features

- **Cycle time trend chart** — average cycle time by week with a 6-day target line and trend direction indicator
- **Issue type & work category breakdowns** — 100% stacked horizontal bar charts
- **Top stats** — avg cycle time, avg cycle time for never-blocked cards, avg lead time, avg weekly std dev (all colour-coded)
- **Filterable cards table** — search by keyword, filter by label or issue type
- **Date range picker** — narrow data to any custom window within the last 90 days
- **Colour-coded thresholds** — green/yellow/orange/red based on configurable targets

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (any recent version)
- A Jira API token — generate one at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

### Run locally

```bash
# Clone the repo
git clone https://github.com/uttydoshi/ai-platform-control-center.git
cd ai-platform-control-center

# Start the proxy server
node server.js
```

Open **http://localhost:3000** in your browser.

On first load, enter your Jira email and API token. Credentials are saved to `localStorage` so you only need to do this once.

## Files

| File | Description |
|------|-------------|
| `aipl-dashboard-standalone.html` | The dashboard — served by the local proxy server |
| `server.js` | Tiny Node.js proxy server (no npm required) that forwards requests to the Jira REST API |
| `aipl-dashboard.html` | Cowork/Claude artifact version (requires Cowork runtime) |

## How it works

The dashboard calls the Jira REST API (`POST /rest/api/3/search/jql`) via a local proxy server to avoid CORS restrictions. The proxy runs on `localhost:3000`, forwards requests to `cultureamp.atlassian.net` with your credentials, and serves the HTML file.

## JQL query

```
project = AIPL
  AND status = Done
  AND issuetype NOT IN (Epic, Milestone, Initiative)
  AND "End date & time" IS NOT EMPTY
  AND "End date & time" >= -90d
ORDER BY "End date & time" DESC
```
