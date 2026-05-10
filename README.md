# Lottery Box

A lightweight comment lottery tool for Xiaohongshu (Little Red Book) content creators. It helps bloggers draw winners from post comments quickly and fairly.

## What It Does

The tool supports two modes for collecting comments and running giveaways:

- **Manual Paste Mode**: Copy comments directly from the Xiaohongshu app, paste them into the tool, and run the draw. Everything is processed locally in the browser.
- **API Auto Mode**: Connect via Xiaohongshu Open Platform OAuth to automatically fetch posts and comments. This requires enterprise developer certification.

## Key Features

- Fair random drawing using Fisher-Yates shuffle with `crypto.getRandomValues`
- Configurable winner count, duplicate user removal, and keyword filtering
- Drawing history stored locally in the browser
- Rate-limited API proxy for secure backend communication

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, Tailwind CSS, Vite |
| Backend | Node.js, Express |
| Build Tool | Vite |

## License

ISC
