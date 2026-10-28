# Scraping alternatives researched — 28 October 2026

The implemented order is free direct retailer search and product fetching, free DuckDuckGo link discovery when retailer search fails, then the already configured scraping provider. PostgreSQL caches successful name searches for six hours and prevents concurrent duplicate work. Search results provide links, while a verified product page supplies actual prices and specifications.

Live development checks returned Logitech mouse, Prestige kettle, book and Casio calculator information through direct fetching. A Bajaj iron search also exercised free web-search discovery. These checks demonstrate working paths, not a guarantee that every retailer page will remain accessible from every host. The paid fallback remains capped, and unavailable results are reported explicitly.

| Alternative                                       | Finding                                                                                                             | Use in this release                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Native HTTP plus Cheerio                          | Already fits the Node deployment; direct requests succeeded against both retailers during verification              | Active first choice for search and product pages                                    |
| DuckDuckGo HTML search                            | Can supply retailer links without an API key; responses and availability vary                                       | Active fallback, with strict destination validation                                 |
| [Scrapling](https://github.com/D4Vinci/Scrapling) | Open-source Python framework with adaptive parsing and browser-based fetchers                                       | Researched; not installed into the existing Node worker                             |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Open-source crawler; its [installation guide](https://docs.crawl4ai.com/basic/installation/) includes browser setup | Researched; self-hosting would add Python/browser operational requirements          |
| [Tavily](https://www.tavily.com/pricing)          | Advertises 1,000 free API credits per month, requiring a separate account/key                                       | Optional future managed discovery provider; not connected or billed by this release |
| [Serper](https://serper.dev/)                     | Advertises free signup queries and a managed search API                                                             | Optional future provider requiring its own account/key; not connected               |

A relevant YouTube reference is [midudev's Amazon price tracker tutorial](https://www.youtube.com/watch?v=YfcgoV19lp4). Its published description covers TypeScript, a proxy provider, stored history and GitHub Actions. The video content was not independently executed; its description does not establish unlimited access or guaranteed scraping reliability.

The decision to keep browser frameworks optional is an implementation judgment: free HTTP paths are already verified and avoid adding a second language and browser process to the current deployment. No provider account, paid subscription or new access credential was created by this research.
