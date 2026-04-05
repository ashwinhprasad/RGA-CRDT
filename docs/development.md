# Development Guide

This guide covers everything you need to build, test, and contribute to the RGA-CRDT monorepo.

## Prerequisites

- **Node.js** 22+ (LTS recommended)
- **npm** 10+
- **Docker** (optional, for the containerized dev environment)

## Repository Structure

```
RGA-CRDT/
├── package.json          # Root package — defines workspaces and shared scripts
├── lerna.json            # Lerna configuration
├── packages/
│   ├── text-crdt/        # Character-level RGA CRDT
│   └── block-crdt/       # Block-based RGA CRDT
└── docs/                 # Documentation
```

This monorepo uses **Lerna v8** with **npm workspaces**. npm workspaces handle dependency hoisting and inter-package symlinks; Lerna orchestrates running scripts across packages.

## Docker Dev Container (Optional)

If you want an isolated environment with Node.js 22 without installing anything locally:

```bash
docker run -it \
  -v $(pwd):/app \
  -w /app \
  --network=host \
  node:22-bullseye \
  bash
```

- `-v $(pwd):/app` mounts your current directory into the container
- `-w /app` sets the working directory to `/app`
- `--network=host` shares the host network, which is useful when debugging on a port

All commands below run the same inside or outside the container.

## First-Time Setup

After cloning the repository, install all dependencies from the root:

```bash
npm install
```

Because npm workspaces are configured in the root `package.json` (`"workspaces": ["packages/*"]`), this single command installs dependencies for the root project and every package under `packages/`, and creates symlinks between packages that depend on each other.

Then build all packages:

```bash
npm run build
```

## Building

### Build all packages

From the root directory:

```bash
npm run build
# equivalent: npx lerna run build
```

Lerna runs the `build` script in each package, which invokes `tsc` to compile `.mts` source files into JavaScript. Output lands in each package's `dist/` directory:

- `packages/text-crdt/dist/`
- `packages/block-crdt/dist/`

### Build a specific package

Using Lerna's `--scope` flag from the root:

```bash
npx lerna run build --scope=text-crdt
npx lerna run build --scope=block-crdt

# Wildcard — matches both packages
npx lerna run build --scope=*-crdt
```

Or navigate to the package directory:

```bash
cd packages/text-crdt
npm run build
```

### Build in watch mode

Run `tsc` in watch mode inside the package directory:

```bash
cd packages/text-crdt
npx tsc --watch
```

Open a second terminal for the other package if you are working across both simultaneously.

## Testing

This project uses **Vitest**. Tests live in each package's `tests/` directory and are auto-discovered by Vitest from the root.

### Run all tests

```bash
npm test
```

### Run tests in watch mode

```bash
npm run test:watch
```

Vitest watches for file changes and re-runs affected tests automatically. Interactive keys while running:

| Key | Action |
|-----|--------|
| `a` | Run all tests |
| `f` | Run only failed tests |
| `q` | Quit |

### Run tests for a specific package

Filter by directory path:

```bash
npm test -- packages/text-crdt
npm test -- packages/block-crdt
```

The `--` separator passes everything after it directly to Vitest.

### Run tests matching a filename pattern

```bash
npm test -- rga.spec
npm test -- crdtDocument
```

### Run a specific test file

```bash
npm test -- packages/text-crdt/tests/rga.spec.mts
```

### Debug tests

```bash
npm run test:debug
```

This starts Vitest with the Node.js inspector listening on `127.0.0.1:3000` and disables file parallelism so tests run sequentially, making stepping through code predictable.

To attach a debugger:

1. Open Chrome and navigate to `chrome://inspect`
2. Click **Open dedicated DevTools for Node**
3. Set breakpoints in your source files and step through the test run

## Typical Development Workflow

1. **Initial setup** (once):
   ```bash
   npm install
   npm run build
   ```

2. **During active development** (two terminals):
   ```bash
   # Terminal 1 — rebuild on save
   cd packages/text-crdt   # or block-crdt
   npx tsc --watch

   # Terminal 2 — re-run tests on save
   npm run test:watch
   ```

3. **Before committing**:
   ```bash
   npm run build   # verify all packages compile cleanly
   npm test        # verify all tests pass
   ```

## Lerna Commands Reference

| Command | Description |
|---------|-------------|
| `npx lerna run <script>` | Run a script in all packages |
| `npx lerna run <script> --scope=<name>` | Run a script in one package |
| `npx lerna run <script> --scope=*-crdt` | Run a script in packages matching a wildcard |
| `npx lerna list` | List all packages managed by Lerna |
| `npx lerna clean` | Remove `node_modules` from all packages |

> **After `lerna clean`**, run `npm install` from the root to restore dependencies.

## Troubleshooting

**"Cannot find module" errors**

```bash
npm install       # restore hoisted dependencies
npm run build     # recompile TypeScript
```

**Tests not found or not running**

- Check that test files end with `.spec.ts`, `.spec.mts`, `.test.ts`, or `.test.mts`
- Confirm Vitest is installed: `npm install --save-dev vitest`

**Lerna commands fail**

- Confirm Lerna is installed: `npm install --save-dev lerna`
- Use `npx lerna` rather than a globally installed `lerna` to ensure the version matches the project
