# Operations Runbook

## Runtime Identity
- Service: `openunum-gemini.service`
- Web UI: `http://127.0.0.1:18884` (override `OPENUNUM_GEMINI_HOST` / `OPENUNUM_GEMINI_PORT`)
- App home: `~/.openunum-gemini` (override `OPENUNUM_GEMINI_HOME`)
- DB: `~/.openunum-gemini/openunum.db`

## Start/Dev
```bash
bun install
bun run src/index.ts
```

## Tests
```bash
bun run test
bun run e2e
```

## Service Install
```bash
mkdir -p ~/.config/systemd/user
cp /home/corp-unum/OpenUnumGeminiVersion/openunum-gemini.service ~/.config/systemd/user/openunum-gemini.service
systemctl --user daemon-reload
systemctl --user enable openunum-gemini.service
systemctl --user restart openunum-gemini.service
```
