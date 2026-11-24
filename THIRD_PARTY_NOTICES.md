# Third-Party Notices

This project redistributes the following third-party software.

## BudouX

- Source: https://github.com/google/budoux
- Copyright 2021 Google LLC
- License: Apache License, Version 2.0 (see `vendor/LICENSE-budoux.txt`)
- Usage: `vendor/budoux.js` is a mechanical esbuild bundle of the BudouX
  Japanese parser (no source logic changes). It is loaded as a content script
  to determine Japanese phrase boundaries for line breaking.

The Apache License, Version 2.0 permits redistribution and commercial use,
provided that the license text and copyright/attribution notices are included.
This project's own source code remains under its own license (ISC); the
bundled BudouX code remains under Apache-2.0.
