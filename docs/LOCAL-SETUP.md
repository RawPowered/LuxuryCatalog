# Run and review locally

[Overview](../README.md) · [Source map](FEATURES-AND-SOURCE.md) · [Evidence](EVIDENCE.md)

## Setup

Use a Node.js version compatible with the package engine requirements in the lockfile, plus npm.

```powershell
git clone https://github.com/RawPowered/LuxuryCatalog.git
cd LuxuryCatalog
npm ci
Copy-Item .env.example .env.local
# Edit .env.local only if using model-powered generation.
npm run dev -- --host 127.0.0.1
```

Open the local address printed by Vite. Bring permitted artwork or a compatible PDF. Model-powered actions need your own configured provider key and may incur usage charges. Existing-image organization and standard export paths do not require creating new model images.

The repository also contains [Windows launchers](../Launch-LuxuryCatalog.ps1). Review their behavior before running them: they can install dependencies, start a development server and open a browser.

## Credential and storage boundary

The current [Vite configuration](../vite.config.ts) defines the provider key in browser-side code. Treat this setup as a trusted local tool. A public hosted deployment needs a server-side provider boundary and appropriate access controls; do not publish a browser bundle containing a private provider key.

The queue lives in browser IndexedDB. Clearing site data or changing browser/origin can remove access to that local work. Maintain separate exports and backups. Artwork sent for model-powered operations leaves the browser for the configured provider; review the permitted use of that artwork before generation.

## Checks

```powershell
npm run lint
npm run build
```

The first command performs TypeScript checking. The second creates the production build; successful compilation does not validate provider generation or commerce import. See [publication results](EVIDENCE.md#publication-checks).

## WordPress companion

The [media mapper](../extension/wp-media-mapper/) is a separate unpacked browser extension. Its manifest requests broad host access. Review permissions and use it only in an authorized WordPress workspace. No extension installation or live media collection was performed for the showcase.
