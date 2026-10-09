# Cloud Storage

The Drive interface stores uploaded files on the backend. In development, the frontend expects the API at `http://localhost:3000/api`.

## Run locally

1. Start the API:

   ```powershell
   cd Server-backend
   npm install
   npm start
   ```

2. In another terminal, start the frontend:

   ```powershell
   cd Server-storage
   npm install
   npm run dev
   ```

Set `VITE_API_BASE_URL` to the backend API URL when deploying to a different host. The production default is the configured storage API host.

Uploaded files are written to `Server-backend/uploads`; configure persistent disk storage for deployments. The API uses resumable 2 MB chunks, lists and previews server files, and supports download, trash, restore, rename, copy, and permanent deletion.

## Checks

Run the API integration tests with `cd Server-backend; npm test` and check the frontend with `cd Server-storage; npm run lint` and `npm run build`.
