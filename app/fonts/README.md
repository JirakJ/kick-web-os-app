# Emoji font

Noto Emoji, Copyright 2013 Google LLC, licensed under [SIL OFL 1.1](OFL.txt).
The app bundles a monochrome regular-weight WOFF2 for TVs with incomplete emoji fonts,
including the military helmet (U+1FA96) and saluting face (U+1FAE1) used in Czechfather's titles.
Native color emoji take precedence when available. Only `.title-symbol` uses this fallback;
its CSS Unicode range excludes ordinary letters, digits and spaces to preserve text spacing.

Source: [google/fonts, revision 8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5](https://github.com/google/fonts/tree/8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5/ofl/notoemoji).
Converted from `NotoEmoji[wght].ttf` with fontTools 4.63.0:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = instantiateVariableFont(TTFont('NotoEmoji[wght].ttf'), {'wght': 400}, inplace=True)
font.flavor = 'woff2'
font.save('NotoEmoji-Regular.woff2')
```

No font download or Python dependency is needed to build or run the app.

The generated WOFF2 has SHA-256 `72149441d478acb7e5e4fe27adbabde4330f86affed8b3301e4bc4c4d92d53c1`.
When replacing it, verify the required glyphs visually and update the asset checksum in `test.cjs`.
