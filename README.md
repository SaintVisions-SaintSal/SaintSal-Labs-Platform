# SaintSal™ Labs Platform

> **Responsible Intelligence** — AI Search & Intelligence Platform powered by HACP™ (Human-AI Connection Protocol, Patent #10,290,222)

Built by **Saint Vision Technologies LLC**

## Verticals

| Vertical | Description |
|----------|-------------|
| **Search** | Universal AI search with web citations |
| **Sports** | Live scores, analysis, player stats, predictions |
| **News** | Breaking news, geopolitics, balanced analysis |
| **Tech** | AI/ML, dev tools, startups, product launches |
| **Finance** | Markets, crypto, earnings, investment research |
| **Real Estate** | Property search, comps, deal analysis, distressed deals |

## Tech Stack

- **Frontend**: Vanilla JS, single-page app with hash routing
- **Backend**: FastAPI (Python) with SSE streaming
- **AI**: Claude API (Anthropic) with vertical-specific system prompts
- **Search**: Tavily API for real-time web search
- **Real Estate**: RentCast API (140M+ properties), PropertyAPI (distressed)
- **Domains**: GoDaddy API
- **Business Formation**: CorpNet API
- **Payments**: Stripe (5 tiers + metered compute billing)

## API Endpoints

### Chat
- `POST /api/chat` — Streaming AI chat with web search

### Real Estate
- `GET /api/realestate/search` — Property search by address/city/zip
- `GET /api/realestate/value` — Property value estimate + sale comps
- `GET /api/realestate/rent` — Rental estimate + rental comps
- `GET /api/realestate/listings/sale` — Active sale listings
- `GET /api/realestate/listings/rental` — Active rental listings
- `GET /api/realestate/market` — Market statistics
- `GET /api/realestate/distressed/{category}` — Foreclosures, pre-foreclosures, tax liens, NODs
- `GET /api/realestate/deal-analysis` — Investment deal calculator

### Finance
- `GET /api/finance/markets` — Market summary

### Domains
- `GET /api/domains/search` — Domain availability search
- `POST /api/domains/purchase` — Domain purchase

### Business Formation
- `GET /api/corpnet/entity-types` — Entity types
- `GET /api/corpnet/packages` — Formation packages
- `POST /api/corpnet/formation` — Submit formation

## Environment Variables

```
TAVILY_API_KEY=your_tavily_key
RENTCAST_API_KEY=your_rentcast_key
GOOGLE_MAPS_KEY=your_google_maps_key
GODADDY_API_KEY=your_godaddy_key
GODADDY_API_SECRET=your_godaddy_secret
CORPNET_DATA_API_KEY=your_corpnet_data_key
CORPNET_API_KEY=your_corpnet_api_key
```

## Running Locally

```bash
pip install fastapi uvicorn httpx anthropic
python server.py
```

Server runs on `http://localhost:8000`

## License

Proprietary — Saint Vision Technologies LLC. All rights reserved.

---

**SaintSal™** · Responsible Intelligence · HACP™ Patent #10,290,222
