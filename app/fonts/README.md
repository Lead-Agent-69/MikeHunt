# Local application fonts

Inter, Syne and Fraunces are vendored as unmodified Latin WOFF2 variable files from Google's official font distribution, retrieved October 29, 2026. Each family's SIL Open Font License is included beside its asset. They retain the existing application's selected Latin coverage and weight ranges; other scripts use the CSS fallback stacks. Fraunces includes its optical-size axis.

`next/font/local` serves these assets from the application and generates fallback metrics and preload links. Production builds no longer require access to Google Fonts. Keep the CSS variable names in `app/layout.tsx` unchanged when updating assets.

Original distribution request:

https://fonts.googleapis.com/css2?family=Inter:wght@400..900&family=Syne:wght@400..800&family=Fraunces:opsz,wght@9..144,100..900&display=swap

Licenses: https://github.com/google/fonts/tree/main/ofl/inter, https://github.com/google/fonts/tree/main/ofl/syne, https://github.com/google/fonts/tree/main/ofl/fraunces.

Retain upstream license notices when redistributing or replacing these files. No font outlines were modified.
