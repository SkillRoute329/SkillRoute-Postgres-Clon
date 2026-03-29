---
description: Build and deploy frontend to Firebase Hosting (production). Run after any code changes to ensure local and online versions are in sync.
---

# Deploy to Firebase Hosting

// turbo-all

1. Build the production bundle from the frontend directory.

```bash
npm run build 2>&1
```

(Run in: `c:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0\frontend`)

1. Deploy the built bundle to Firebase Hosting.

```bash
firebase deploy --only hosting 2>&1
```

(Run in: `c:\Users\jonat\Desktop\PROYECTOS\TransformaFacil-2.0`)

The live URL is: [https://ucot-gestor-cloud.web.app](https://ucot-gestor-cloud.web.app)
