## Docker Dev Container

```bash
docker run -it --rm \
  -v $(pwd):/app \
  -w /app \
  --network=host \
  node:22-bullseye \
  bash
```


## Initial setup commands (run inside the container)

```bash
npm init -y
npm install --save-dev typescript ts-node @types/node
npx tsc --init
npm install --save-dev vitest
```



