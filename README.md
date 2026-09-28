# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Starting services

Start backend (launches DB and Express server):

```bash
npm run start:backend
```

Start frontend (Vite dev server) separately:

```bash
npm run start:frontend
```

Start both in development (concurrently):

```bash
npm run dev
```

## Workflow API execution

Start a saved workflow from the diagram UI or another authenticated client. The backend runs its DAG independently of the browser and returns a run ID immediately:

```http
POST /api/workflows/:workflowId/run
Authorization: Bearer <session-token-or-API-token-with-workflows:run-scope>
Content-Type: application/json
```

```json
{
  "triggeredBy": "deployment-service",
  "limit": "all",
  "extraVars": { "environment": "staging" }
}
```

The response is `202 Accepted` with a `run` object. Poll `GET /api/workflows/:workflowId/runs/:runId` for persisted status, node states, and logs. Approval steps pause the run until an authenticated client posts `{ "decision": "yes" }` or `{ "decision": "no" }` to `/api/workflows/:workflowId/runs/:runId/approval/:nodeId`.

For live updates, connect to `/ws?workflowId=<workflowId>&token=<session-token>`. The socket sends `INIT_WORKFLOW_RUN` with the latest run, then `WORKFLOW_RUN_UPDATE` snapshots as nodes progress. It can reconnect after the browser disconnects; the backend continues the run.

API tokens can be generated under **API & Webhooks**. Grant `workflows:run` to start runs, `workflows:read` to poll runs/subscribe to live updates, and `workflows:approve` to resolve approval gates. A run token can also subscribe to its own workflow's live updates.
