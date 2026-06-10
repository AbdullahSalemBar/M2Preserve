# Deploying M2Preserve Annotation UI on GitHub Pages

This setup assumes your repository has several folders, such as `scripts/`, `dataset/`, and `annotation-ui/`.

The website app is inside:

```text
annotation-ui/
```

The deployment workflow is:

```text
.github/workflows/deploy-annotation-ui.yml
```

## Steps

1. Upload/copy this folder structure into your GitHub repository.
2. Commit and push to the `main` branch.
3. In GitHub, open:

```text
Settings → Pages
```

4. Set:

```text
Build and deployment → Source → GitHub Actions
```

5. Go to the `Actions` tab.
6. Wait until `Deploy Annotation UI to GitHub Pages` is green.
7. Open the Pages URL.

## Local test

```bash
cd annotation-ui
npm install
npm run dev
```

## Build test

```bash
cd annotation-ui
npm run build
npm run preview
```

## Notes

- The app works as a static website.
- The app does not store annotations in GitHub.
- Annotators upload a JSON file, annotate it, then click `Save / Download`.
- The downloaded JSON can be re-uploaded later to continue.
