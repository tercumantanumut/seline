# comfyui-json

Install npm

```
bun i comfyui-json
```

API

```ts
const deps = await generateDependencyGraph({
  workflow_api, // required, workflow API form ComfyUI
  snapshot, // optional, snapshot generated form ComfyUI Manager
  computeFileHash, // optional, any function that returns a file hash
  handleFileUpload, // optional, any custom file upload handler, for external files right now
});
```

Example output

```
{
  "comfyui": "d1533d9c0f1dde192f738ef1b745b15f49f41e02",
  "custom_nodes": {
    "https://github.com/ltdrdata/ComfyUI-Impact-Pack": {
      "url": "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
      "name": "ComfyUI Impact Pack",
      "hash": "585787bfa7fe0916821add13aa0e2a01c999a4df",
      "warning": "No hash found in snapshot, using latest commit hash",
      "pip": [
        "ultralytics"
      ]
    }
  },
  "models": {
    "checkpoints": [
      {
        "name": "SD1.5/V07_v07.safetensors"
      }
    ]
  },
  "files": {
    "images": [
      {
        "name": "2pass-original.png"
      }
    ]
  }
}
```

Example file upload handler

```ts
const handleFileUpload = async (
  _path: string,
  hash: string,
  prevHash?: string,
) => {
  console.log(
    `Uploading file ${_path} with hash ${hash} and previous hash ${prevHash}`,
  );

  return _path;
};
```

Example bun file hasher

```ts
const computeFileHash = async (_path: string) => {
  const comfyuiPath = values.comfyui_path;
  if (!comfyuiPath) {
    return;
  }

  const f = file(path.join(comfyuiPath, _path));
  const exist = await f.exists();
  if (exist) {
    const a = await f.arrayBuffer();
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(a);
    const hash = hasher.digest("base64");

    return hash;
  }
};
```

To install dependencies:

```bash
bun install
```

To test locally run:

```bash
bun run src/cli.ts -i "./workflow_api.json" -c "path/to/your/ComfyUI"
```