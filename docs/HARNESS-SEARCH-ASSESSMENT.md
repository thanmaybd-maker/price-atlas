# Account-backed AI assistance: assessment

Reviewed 1 November 2026. The supported CLI integration is implemented in [the product research worker](AGENT-PRODUCT-RESEARCH.md); this document records the architectural source review.

## What Mobile Harness does

Mobile Harness starts the Antigravity `agy` CLI inside its Android Linux runtime. Its Kotlin bridge sends prompts through stdin and parses stream-json events. Its authentication controller drives the CLI's Google sign-in flow; the CLI retains the credentials. This is a subprocess integration, not an unlimited model API or a retailer data service.

Reviewed upstream commit: `ae299adc7ecef5d9ed63f46e3dbd9af30818968d`.

- [Runtime bridge](https://github.com/techjarves/Mobile-Harness/blob/ae299adc7ecef5d9ed63f46e3dbd9af30818968d/app/src/main/java/com/jarves/mh/runtime/AntigravityRuntimeBridge.kt)
- [Authentication controller](https://github.com/techjarves/Mobile-Harness/blob/ae299adc7ecef5d9ed63f46e3dbd9af30818968d/app/src/main/java/com/jarves/mh/runtime/AntigravityAuthController.kt)
- [Google's supported headless interface](https://antigravity.google/docs/cli/headless/)
- [Google's plan and quota documentation](https://antigravity.google/docs/plans)

The upstream bridge enables `--dangerously-skip-permissions`. Price Atlas should not copy that setting for shopper-controlled prompts. Headless tasks can use ordinary scoped permissions and sandbox restrictions instead.

## Useful role in Price Atlas

An optional private worker could invoke the supported CLI on an authenticated machine, request structured query/identity suggestions, validate them with existing variant guards, and cache the accepted result. Google owns the account quota; using this path is not unlimited usage. Whether any specific public deployment fits the account's terms and entitlement must be established before enabling it.

For candidate product discovery, require actual source URLs, allow only supported retailer product URLs, reject conflicting models/variants/accessories, and fetch evidence through the existing retailer pipeline. A model response alone must never become a verified price, history observation, stock claim or alert.

The machine running the worker must stay on and authenticated. A phone login does not automatically authenticate Render or Vercel. Do not export OAuth tokens into environment variables or expose a desktop agent to arbitrary public execution. No such endpoint or credential transfer has been configured in this change.

## OmniRoute

[OmniRoute](https://github.com/cheaper-inference/OmniRoute) can route OpenAI-compatible model requests among configured provider accounts and use fallbacks. Its README explicitly distinguishes eligible third-party quotas from a token grant by OmniRoute. A router is useful after there are usable upstream accounts and a reachable authenticated gateway; it cannot create retailer access or remove provider limits.

## Fix shipped independently

Basic retailer discovery now starts immediately with the shopper's original query. Optional Gemini assistance cannot delay it or restart it when a rewrite arrives late. GPU matching accepts Graphic Card / Graphics Cards while preserving model numbers. A held-assist browser test verifies both behaviors. This keeps ordinary search available when an AI provider is slow or exhausted, without requiring a new harness.

## Integration boundaries

The implementation uses a signed-in private worker, shared bounded queue, exclusive job lease, daily attempt limit, validated lead cache and ordinary source verification. It does not turn an email address into authentication, copy Google credentials to cloud services, or expose a general-purpose agent endpoint. A cloud-hosted Google session remains a separate deployment prerequisite; the hybrid local-worker/cloud-website path uses the existing signed-in machine.
