# x-agent

An automated AI growth engine for X (Twitter), designed to build technical authority by distilling complex AI research and engaging with industry leaders in real-time.

- **No X API keys** — posts via **headed Playwright** in a persistent Chrome profile (stealthy).
- **Convergence Focus**: Specially tuned for AI, Crypto, Web3, and Prediction Markets.
- **Knowledge-Driven**: Mines your own technical PDF library for unique insights.
- **High-Volume Authority**: Designed for 20+ high-quality posts/day with smart visual attachments.
- **Real-time Engagement**: Proactively monitors "Alpha Handles" to be the first to reply/quote.

## 🚀 Quick Start

```bash
cd ~/projects/x-agent
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env — set TZ, LLM_API_KEY, and your desired DAILY_MAX (e.g. 20)
```

### 1. Setup Your Voice
Edit `voice-samples.md` — paste 15–20 of your real posts (one per paragraph). This ensures the AI doesn't sound like a bot.

### 2. Initial Login
```bash
npm run browser:login
```
Log in to X in the Chrome window, then close it. Your session is saved in `data/browser-profile/`.

### 3. Connect Your Knowledge Base
The agent can mine your technical resources for insights. Ensure your AI PDFs are located in:
`~/school/ai-stuff/` (specifically folders like `/learn`, `/full-pdf`, `/ai-related`).

## 🛠️ Operation Modes

### A. The "Sentinel" (Real-time Growth)
**Preferred for engagement.** Keeps X open and monitors industry titans.
```bash
npm run observe
```
- **What it does**: Scans your timeline and specific **Alpha Handles** (Elon Musk, Meta, OpenAI, Solana, Polymarket, etc.).
- **Goal**: Be the first to reply or quote a high-profile post with a smart, technical take.
- **Frequency**: Loops every `OBSERVE_INTERVAL_SECONDS`.

### B. The "Authority Worker" (Scheduled Content)
**Preferred for original posts.**
```bash
npm run worker
```
- **What it does**: Gathers fuel from Google News, RSS, and your **PDF Library**.
- **Visuals**: Automatically matches technical insights with screenshots from your `media/screenshots` or `ai-stuff` folders.
- **Schedule**: Typically run via cron. Respects `POST_WINDOWS` and `MIN_POST_GAP_MINUTES`.

## 🧠 Content Strategy

### The "Knowledge Mine"
The agent doesn't just summarize news; it reads your PDFs. It extracts a core thesis or surprising fact from your research and transforms it into a "teaching" post, positioning you as an expert.

### High-Engagement Visuals
The agent uses a **Smart Visual Matcher**:
1. **Direct Match**: Finds images named after the PDF source.
2. **Keyword Match**: Searches for images containing keywords from the post text.
3. **Hook Image**: Attaches a random high-quality AI screenshot to increase "stopping power."

### The "Convergence" Filter
The agent is tuned to engage with the intersection of:
- **AI**: LLMs, Agents, RAG, Engineering.
- **Crypto/Web3**: Solana, L2s, Tokenomics.
- **Markets**: Prediction markets (Polymarket), Beta/Alpha analysis.

## ⚙️ Configuration Guide

| Variable | Recommended | Purpose |
|----------|----------------|----------|
| `DAILY_MAX` | `20` | Total original posts per day. |
| `WATCH_HANDLES` | `elonmusk,samA,solana,Polymarket...` | Who to monitor for instant replies. |
| `MAX_TARGET_AGE_MINUTES` | `15` | How "fresh" a post must be to trigger a reply. |
| `MIN_POST_GAP_MINUTES` | `30` | Prevents "bursting" posts (anti-ban). |
| `AGENT_MODE` | `both` | Try engagement first, then original posts. |

## ⚠️ Safety & Stealth
- **Symmetry**: High volume is balanced by a mix of original posts, replies, and quotes.
- **Jitter**: Random delays are added to all actions to avoid robotic patterns.
- **Quality Gate**: Every post must pass the `quality.ts` check (no "AI-slop" phrases).
- **Kill Switch**: Create `data/PAUSED` or set `PAUSED=true` to stop all activity immediately.

## Layout
```
src/
  observe.ts     # The Sentinel: Real-time monitoring & engagement
  worker.ts      # The Authority: Scheduled high-volume content
  sources/
    library.ts   # PDF Knowledge Miner
    ...
  engage/        # Response logic, Alpha handle scraping, mirror-posting
  publisher.ts   # Stealthy browser automation
```
