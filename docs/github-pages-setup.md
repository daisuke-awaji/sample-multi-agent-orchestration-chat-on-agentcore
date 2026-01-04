# GitHub Pages Setup for API Documentation

This document explains how to enable GitHub Pages for hosting the API documentation.

## Prerequisites

- Repository must be public (or GitHub Pro/Enterprise for private repositories)
- GitHub Actions workflow is already configured in `.github/workflows/ci.yml`

## Setup Steps

### 1. Enable GitHub Pages

1. Go to your GitHub repository
2. Click on **Settings** tab
3. In the left sidebar, click **Pages**
4. Under **Build and deployment**:
   - **Source**: Select "GitHub Actions"
5. Save the changes

### 2. Push to Main Branch

Once the workflow is configured and GitHub Pages is enabled:

```bash
git add .
git commit -m "Add GitHub Pages deployment for API documentation"
git push origin main
```

### 3. Monitor Deployment

1. Go to the **Actions** tab in your repository
2. Look for the latest workflow run
3. The `deploy-docs` job will deploy the documentation
4. Once completed, the documentation will be available at:
   - `https://<username>.github.io/<repository>/`

## Documentation Structure

After deployment, the following pages will be available:

- **Landing Page**: `https://<username>.github.io/<repository>/`
  - Provides links to both API documentations
  
- **Backend API**: `https://<username>.github.io/<repository>/backend.html`
  - REST API documentation (Port 3000)
  - User management, agent configuration, session control
  
- **Agent Runtime API**: `https://<username>.github.io/<repository>/agent.html`
  - Streaming AI agent invocation endpoint (Port 8080)
  - NDJSON response format

## Workflow Details

The GitHub Actions workflow includes the following jobs:

1. **lint**: Validates code style and OpenAPI specifications
2. **test**: Runs test suite
3. **build**: Builds packages and generates API documentation
4. **deploy-docs**: Deploys documentation to GitHub Pages (main branch only)

### Deployment Trigger

Documentation is automatically deployed when:
- Commits are pushed to the `main` branch
- The `build` job completes successfully

## Troubleshooting

### Pages not deploying

1. Check GitHub Actions workflow status
2. Ensure GitHub Pages source is set to "GitHub Actions"
3. Verify repository visibility (public or Pro/Enterprise)

### 404 Error

1. Wait a few minutes for initial deployment
2. Check if the workflow completed successfully
3. Verify the URL format matches your repository

### Documentation not updating

1. Clear browser cache
2. Check if the latest commit triggered the workflow
3. Look for errors in the workflow logs

## Customization

### Custom Domain

To use a custom domain:

1. In GitHub Pages settings, enter your custom domain
2. Add CNAME record in your DNS provider
3. Enable "Enforce HTTPS" (recommended)

### Update Landing Page

Edit the HTML in `.github/workflows/ci.yml` under the "Build docs directory" step.

## Related Documentation

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [OpenAPI Documentation Guide](./local-development-setup.md#api-documentation)
