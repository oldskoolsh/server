### "Oldskool" Server (TypeScript)

This is an experimental implementation of Oldskool's server in TypeScript.

This was my first foray into non-frontend TypeScript and it shows. At a certain point I decided against TS, so new
features will not be implemented. This current state serves as prior art marker only.

It is quite complete, but missing (at least):

- Git management; this expects to have a directory with pre-cloned/kept-updated git checkouts. (use git-sync for that)
- Authentication and all that depends on it. Private repos, Authorizing machines, Machine tokens and Teams are all missing.
- Decent schema generation. The generated schema works, but is very limited.
- Freeze capabilities.

