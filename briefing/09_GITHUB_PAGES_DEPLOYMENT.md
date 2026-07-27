# GitHub Pages Deployment

## 1. Hosting model

SampleScout should build into static files and deploy through GitHub Actions to GitHub Pages.

Use:

- SvelteKit
- `@sveltejs/adapter-static`
- GitHub Pages Actions deployment
- HTTPS provided by GitHub Pages

No runtime server is available.

## 2. Repository URL behavior

Two URL shapes are possible.

### User/organization site

Repository:

`username.github.io`

Production root:

`https://username.github.io/`

Base path:

empty

### Project site

Repository:

`sample-scout`

Production root:

`https://username.github.io/sample-scout/`

Base path:

`/sample-scout`

SvelteKit must configure `paths.base` appropriately for a project site.

All of the following must respect the base path:

- Links
- Assets
- Manifest
- Service worker
- Icons
- OAuth callback
- Application navigation
- Fallback page

Do not hard-code root-relative `/capture` URLs for a project site.

## 3. Static adapter

Use `@sveltejs/adapter-static`.

GitHub Pages has no server-side route fallback. Configure:

- Prerendered routes where possible
- `404.html` fallback if client-side routing requires it
- Appropriate trailing-slash behavior
- Correct base path

Prefer simple prerendered route shells over a single empty SPA shell where feasible.

## 4. Audiotool redirect URI

The production `redirectUrl` must match the Audiotool registered redirect URI exactly.

Pay attention to:

- Scheme: `https`
- Host
- Repository base path
- Callback path
- Trailing slash
- Custom domain changes

Example project-site callback:

`https://username.github.io/sample-scout/account/`

Register the exact selected URL in the Audiotool developer application.

A later custom-domain migration requires adding or changing the registered redirect URI and testing login again.

## 5. Development redirect URI

Follow Audiotool’s current browser-authentication documentation for the local host and port.

At the time of this briefing, the official documentation specifies `127.0.0.1` and warns against using `localhost` for the registered development redirect.

Keep the dev redirect configurable through public build-time configuration, not a secret.

## 6. Public configuration

Safe frontend configuration:

- Audiotool client ID
- Audiotool OAuth scopes
- Redirect URL
- GitHub Pages base path
- App version

Do not put secrets in:

- Repository variables
- Frontend environment variables
- Source code
- GitHub Actions build arguments

A personal access token is never appropriate for the public app.

## 7. GitHub Actions

The workflow should:

1. Check out repository.
2. Set up Node.
3. Install with lockfile.
4. Run formatting/lint/type checks.
5. Run unit tests.
6. Build SvelteKit static output.
7. Upload the Pages artifact.
8. Deploy with the official Pages action.

Pin major action versions intentionally and review updates.

## 8. PWA scope

For a project site, service-worker scope must remain under the repository base path.

Verify:

- App installs from the intended URL.
- Offline shell works under the base path.
- Navigation does not escape to domain root.
- Manifest `start_url` is correct.
- Icon paths are correct.
- OAuth callback is not broken by the service worker.
- New deployments update cleanly.

## 9. Caching

Cache:

- Application shell
- Fonts if locally bundled
- Icons
- Static assets

Use caution for:

- OAuth callback documents
- Audiotool API requests
- Upload requests
- Audio binaries in OPFS

Do not place local recordings in Cache Storage when OPFS is the intended binary repository.

## 10. Security headers

GitHub Pages offers limited control over response headers.

Use what is feasible in static HTML:

- CSP meta tag after testing
- `Referrer-Policy` meta tag
- Avoid inline scripts where practical
- Dependency review
- Subresource integrity only where it is maintainable

Do not claim that meta-delivered policies are equivalent to full server-header control.

## 11. Custom domain

A custom domain may improve:

- Branding
- Stable OAuth redirect URL
- Shorter install URL

But it introduces:

- DNS configuration
- Audiotool redirect update
- Service-worker migration considerations
- Old-origin local files remaining on the old origin

Browser storage is origin-bound. Changing from a GitHub project URL to a custom domain does not migrate local files automatically.

This should be decided before public usage if possible.

## 12. GitHub Pages limitations relevant to the app

GitHub Pages hosts application assets only.

It does not provide:

- API routes
- Secret storage
- Server transcoding
- Cross-device storage
- Reliable background upload
- Scheduled cleanup
- OAuth token server sessions

Any design that assumes those features violates the no-backend constraint.
