# CRDT Development Environment Setup

This repository uses **Lerna** to manage multiple packages in a monorepo structure. This guide will help you understand how to build and test packages individually or in groups.

## 📦 Repository Structure

This monorepo contains two packages:

1. **text-crdt** (`packages/text-crdt/`) - Plain text CRDT implementation
2. **block-crdt** (`packages/block-crdt/`) - Block-based CRDT implementation

## 🐳 Docker Dev Container

Use this command to start a development container with Node.js 22:

```bash
docker run -it \
  -v $(pwd):/app \
  -w /app \
  --network=host \
  node:22-bullseye \
  bash
```

**Explanation:**
- `-v $(pwd):/app` - Mounts your current directory into the container
- `-w /app` - Sets the working directory to `/app`
- `--network=host` - Shares the host's network (useful for debugging)

## 🚀 Initial Setup

### First-time setup (run inside the container)

```bash
npm init -y
npm install --save-dev typescript ts-node @types/node lerna
npx tsc --init
npm install --save-dev vitest
```

### Install dependencies for all packages

After cloning the repository or when dependencies change, run:

```bash
npm install
```

**What this does:** Since we're using npm workspaces (configured in root `package.json`), this command installs dependencies for the root project AND all packages in `packages/*` directory. It also creates symlinks between packages if they depend on each other.

**Alternative (using Lerna):**
```bash
npm run bootstrap
# or directly: npx lerna bootstrap
```

This is Lerna's traditional way of linking packages together, but npm workspaces handle this automatically now.

## 🔨 Building Packages

### Build all packages

From the **root directory**, run:

```bash
npm run build
# or directly: npx lerna run build
```

**What this does:** Lerna runs the `build` script defined in each package's `package.json`. For this project, each package runs `tsc` (TypeScript compiler) to compile `.ts/.mts` files into JavaScript in their `dist/` folders.

**Output:** Compiled JavaScript files will be created in:
- `packages/text-crdt/dist/`
- `packages/block-crdt/dist/`

### Build a specific package

To build only one package, navigate to its directory:

```bash
cd packages/text-crdt
npm run build
```

Or from the root, use Lerna's scope flag:

```bash
npx lerna run build --scope=text-crdt
```

**Explanation:**
- `--scope=text-crdt` - Only runs the command in the package named "text-crdt"
- You can also use wildcards like `--scope=*-crdt` to match multiple packages

### Build in watch mode

To automatically rebuild when files change:

```bash
cd packages/text-crdt
tsc --watch
```

## 🧪 Testing Packages

This project uses **Vitest** for testing. Tests are located in each package's `tests/` directory.

### Run all tests

From the **root directory**:

```bash
npm test
# or: npm run test
```

**What this does:** Runs Vitest which automatically discovers and runs all test files matching patterns like `*.spec.ts`, `*.spec.mts`, `*.test.ts`, etc. across all packages.

### Run tests in watch mode

```bash
npm run test:watch
```

**What this does:** Vitest watches for file changes and automatically re-runs affected tests. This is great for development as you get instant feedback.

**How to use:**
- Save any file to trigger test runs
- Press `a` to run all tests
- Press `f` to run only failed tests
- Press `q` to quit

### Run tests for a specific package

**Option 1:** Navigate to the package directory (if package has its own test script)

```bash
cd packages/text-crdt
npm test
```

**Option 2:** Use Vitest's filter from the root

```bash
npm test -- packages/text-crdt
# or filter by test file name pattern:
npm test -- rga.spec
```

**Explanation:**
- The `--` separates npm arguments from the arguments passed to the underlying command (vitest)
- Everything after `--` is passed directly to Vitest
- Vitest will only run tests in files matching the pattern

### Run a specific test file

```bash
npm test -- packages/text-crdt/tests/rga.spec.mts
```

### Debug tests

```bash
npm run test:debug
```

**What this does:** Starts Vitest with Node.js inspector enabled on port 3000. You can:
1. Open Chrome and go to `chrome://inspect`
2. Click "Open dedicated DevTools for Node"
3. Set breakpoints and debug your tests

**Note:** `--no-file-parallelism` runs tests sequentially, making debugging easier.

## 📚 Common Lerna Commands Cheat Sheet

### Run a script in all packages
```bash
npx lerna run <script-name>
```
Example: `npx lerna run build`

### Run a script in specific package(s)
```bash
npx lerna run <script-name> --scope=<package-name>
```
Example: `npx lerna run build --scope=text-crdt`

### Run a script in multiple packages using wildcards
```bash
npx lerna run <script-name> --scope=*-crdt
```

### List all packages
```bash
npx lerna list
```

### Clean node_modules in all packages
```bash
npx lerna clean
```

**Warning:** This removes `node_modules` from all packages. You'll need to run `npm install` again.

## 🔄 Typical Development Workflow

1. **Initial setup:**
   ```bash
   npm install
   npm run build
   ```

2. **During development:**
   - Open one terminal for building: `cd packages/text-crdt && tsc --watch`
   - Open another terminal for testing: `npm run test:watch`
   - Make changes to your code
   - Tests auto-run and you see results immediately

3. **Before committing:**
   ```bash
   npm run build    # Ensure all packages build successfully
   npm test         # Run all tests once to verify everything passes
   ```

## 🐛 Troubleshooting

### "Cannot find module" errors
- Run `npm install` from the root to ensure all dependencies are installed
- Run `npm run build` to compile all TypeScript files

### Tests not running
- Ensure Vitest is installed: `npm install --save-dev vitest`
- Check that test files end with `.spec.ts`, `.spec.mts`, `.test.ts`, or `.test.mts`

### Lerna commands not working
- Ensure Lerna is installed: `npm install --save-dev lerna`
- Use `npx lerna` instead of `lerna` if you haven't installed it globally

```



