# AI Platform Control Center

Engineering dashboards for the AI Platform team — delivery metrics, LLM model usage, and more.

## Dashboards

### 📊 Delivery Stats (`/aipl-delivery-stats`)
Jira-powered delivery metrics for the AIPL project.

- Average cycle time by week with trend direction indicator
- Ideal cycle time reference line (6 days)
- Cards in progress table with working days elapsed (excludes weekends & Victorian public holidays)
- Issue type & work category breakdowns (100% stacked horizontal bar charts)
- Top stats: avg cycle time, avg cycle time for never-blocked cards, avg lead time, avg weekly std dev — all colour-coded against targets
- Filterable cards table — search by keyword, label, or issue type with sort and pagination
- Date range picker — narrow data to any custom window within the last 90 days
- Dark / light theme toggle

### 🤖 LLM Model Usage (`/llm-model-usage`)
DataDog-powered LLM observability dashboard.

- Model usage, token consumption, and cost across applications and environments
- Filter by time range (1d / 7d / 30d), environment, application, and model
- Total tokens and cost summary stats
- Dark / light theme toggle

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (any recent version)
- **Jira** — API token from [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- **DataDog** (for LLM dashboard) — [API key](https://app.datadoghq.com/organization-settings/api-keys) and [Application key](https://app.datadoghq.com/organization-settings/application-keys)

### Run locally

```bash
# Clone the repo
git clone https://github.com/uttydoshi/ai-platform-control-center.git
cd ai-platform-control-center

# Start the proxy server
node server.js
```

Open **http://localhost:3000** in your browser — this shows the landing page with links to all dashboards.

Credentials are saved to `localStorage` so you only enter them once per browser.

---

## Files

| File | Description |
|------|-------------|
| `server.js` | Local proxy server — routes requests and proxies Jira & DataDog APIs to avoid CORS |
| `index.html` | Landing page with links to all dashboards |
| `aipl-dashboard-standalone.html` | Delivery Stats dashboard (Jira) |
| `llm-model-usage.html` | LLM Model Usage dashboard (DataDog) |

## URLs

| Path | Dashboard |
|------|-----------|
| `http://localhost:3000` | Landing page |
| `http://localhost:3000/aipl-delivery-stats` | Delivery Stats |
| `http://localhost:3000/llm-model-usage` | LLM Model Usage |
