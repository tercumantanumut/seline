# DuckDuckGo Search

Search for text, news, images and videos using DuckDuckGo's search engine.

## Features

- 🔍 Text search functionality with rich results
- 🌍 Region-specific searches
- 🛡️ SafeSearch options
- ⏰ Time-limited searches
- 🔄 Multiple backend support (HTML and Lite)
- 🌐 Proxy support
- 📝 Comprehensive logging
- 🔒 Optional SSL verification
- 🎭 Random User-Agent rotation

## API Reference

### DDGS Class Options

| Option  | Type    | Default | Description                     |
| ------- | ------- | ------- | ------------------------------- |
| headers | Object  | {}      | Custom HTTP headers             |
| proxy   | string  | null    | Proxy server URL                |
| timeout | number  | 10000   | Request timeout in milliseconds |
| verify  | boolean | true    | Enable/disable SSL verification |

### Search Options

| Option     | Type   | Default    | Description               |
| ---------- | ------ | ---------- | ------------------------- |
| keywords   | string | Required   | Search query              |
| region     | string | 'wt-wt'    | Region code               |
| safesearch | string | 'moderate' | SafeSearch level          |
| timelimit  | string | null       | Time restriction          |
| backend    | string | 'auto'     | Search backend            |
| maxResults | number | null       | Maximum results to return |

## Usage

### Basic Search

```typescript
import { DDGS } from "duckduckgo-search-api";
const ddgs = new DDGS();
async function search() {
  const results = await ddgs.text({
    keywords: "TypeScript tutorial",
    maxResults: 10,
  });
  console.log(results);
}
```

### Advanced Options

```typescript
const ddgs = new DDGS({
  headers: {
    // Custom headers
  },
  proxy: "http://proxy.example.com:8080",
  timeout: 15000,
  verify: false, // Disable SSL verification
});
const results = await ddgs.text({
  keywords: "TypeScript tutorial",
  region: "us-en",
  safesearch: "strict",
  timelimit: "y", // Past year
  backend: "html",
  maxResults: 25,
});
```

## Error Handling

- `DuckDuckGoSearchError`: General search errors
- `RatelimitError`: Rate limiting issues / CAPTCHA
- `TimeoutError`: Request timeouts

## Roadmap

- [x] Implement keyword search with HTML backend
- [x] Random User-Agent rotation with browser impersonation
- [x] Proxy support
- [x] Custom timeout handling
- [x] Region-specific searches
- [x] Comprehensive logging system
- [x] Error handling with custom errors
- [x] SSL verification toggle
- [ ] HTTP client that can impersonate web browsers
- [ ] Lite backend implementation
- [ ] News search functionality
- [ ] Image search functionality
- [ ] Video search functionality
- [ ] Cookie management
- [ ] Comprehensive test suite
  - [ ] Unit tests
  - [ ] Integration tests
  - [ ] E2E tests
- [ ] CI/CD Pipeline

## Acknowledgments

Duckduckgo_search takes inspiration from the following projects:

- [Duckduckgo_search (original Python implementation)](https://github.com/deedy5/duckduckgo_search)

## 📢 Disclaimer

This library is not affiliated with DuckDuckGo and is for educational purposes only. It is not intended for commercial use or any purpose that violates DuckDuckGo's Terms of Service. By using this library, you acknowledge that you will not use it in a way that infringes on DuckDuckGo's terms. The official DuckDuckGo website can be found at https://duckduckgo.com.
