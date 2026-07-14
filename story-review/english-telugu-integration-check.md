# English–Telugu Story Integration Check

- **Gate result:** PASS — integration may proceed
- **English source:** `src/shared/constellationData.ts` → runtime `CONSTELLATION_DATA.constellations`
- **Telugu source:** `stories/telugu-bedtime-stories.md`
- **English runtime records:** 88
- **Telugu manuscript records:** 88
- **English story baseline SHA-256:** `98fbbc4b86f801aee6df8cdb954d3a644e53a6c73808b145feff7078197e8356`
- **Puzzle coordinates/connections baseline SHA-256:** `d804ea55df720c2c8ba613ecac54326d0ebe45c99629416630a2e2fe21c1d995`

## Located integration surfaces

- Puzzle IDs/order and English stories: `src/shared/constellationData.ts`
- Runtime schema and validation: `src/shared/constellations.ts`, `src/shared/constellationLoader.ts`
- Completed-story modal: `src/client/ui/StoryCard.ts`
- Modal callers: `src/client/scenes/Play.ts`, `src/client/scenes/MySky.ts`
- Audio: ambient sound toggle only in `src/client/audio/ambience.ts` and `Play.ts`; story narration/speaker logic does not exist.
- Localization: no existing i18n/localization framework or language preference exists.

## Verification summary

- Numbers 1–88 present exactly once: yes
- Duplicate English constellation IDs: none
- English/Telugu IAU order identical: yes
- Telugu translated titles used for mapping: no
- English runtime stories modified during verification: no
- Puzzle coordinates/connections modified during verification: no

## Issues

- None.

## All 88 records

| # | Existing ID | English IAU name | Telugu manuscript IAU name | English story | Telugu story | Status | Notes |
|---:|---|---|---|:---:|:---:|---|---|
| 1 | `ursa-minor` | Ursa Minor | Ursa Minor | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 2 | `cassiopeia` | Cassiopeia | Cassiopeia | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 3 | `lyra` | Lyra | Lyra | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 4 | `corona-borealis` | Corona Borealis | Corona Borealis | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 5 | `delphinus` | Delphinus | Delphinus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 6 | `orion` | Orion | Orion | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 7 | `cygnus` | Cygnus | Cygnus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 8 | `leo` | Leo | Leo | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 9 | `scorpius` | Scorpius | Scorpius | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 10 | `gemini` | Gemini | Gemini | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 11 | `taurus` | Taurus | Taurus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 12 | `draco` | Draco | Draco | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 13 | `pegasus` | Pegasus | Pegasus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 14 | `andromeda` | Andromeda | Andromeda | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 15 | `perseus` | Perseus | Perseus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 16 | `aquarius` | Aquarius | Aquarius | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 17 | `pisces` | Pisces | Pisces | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 18 | `sagittarius` | Sagittarius | Sagittarius | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 19 | `ursa-major` | Ursa Major | Ursa Major | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 20 | `antlia` | Antlia | Antlia | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 21 | `apus` | Apus | Apus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 22 | `aquila` | Aquila | Aquila | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 23 | `ara` | Ara | Ara | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 24 | `aries` | Aries | Aries | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 25 | `auriga` | Auriga | Auriga | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 26 | `bootes` | Boötes | Boötes | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 27 | `caelum` | Caelum | Caelum | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 28 | `camelopardalis` | Camelopardalis | Camelopardalis | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 29 | `cancer` | Cancer | Cancer | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 30 | `canes-venatici` | Canes Venatici | Canes Venatici | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 31 | `canis-major` | Canis Major | Canis Major | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 32 | `canis-minor` | Canis Minor | Canis Minor | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 33 | `capricornus` | Capricornus | Capricornus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 34 | `carina` | Carina | Carina | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 35 | `centaurus` | Centaurus | Centaurus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 36 | `cepheus` | Cepheus | Cepheus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 37 | `cetus` | Cetus | Cetus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 38 | `chamaeleon` | Chamaeleon | Chamaeleon | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 39 | `circinus` | Circinus | Circinus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 40 | `columba` | Columba | Columba | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 41 | `coma-berenices` | Coma Berenices | Coma Berenices | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 42 | `corona-australis` | Corona Australis | Corona Australis | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 43 | `corvus` | Corvus | Corvus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 44 | `crater` | Crater | Crater | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 45 | `crux` | Crux | Crux | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 46 | `dorado` | Dorado | Dorado | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 47 | `equuleus` | Equuleus | Equuleus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 48 | `eridanus` | Eridanus | Eridanus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 49 | `fornax` | Fornax | Fornax | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 50 | `grus` | Grus | Grus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 51 | `hercules` | Hercules | Hercules | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 52 | `horologium` | Horologium | Horologium | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 53 | `hydra` | Hydra | Hydra | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 54 | `hydrus` | Hydrus | Hydrus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 55 | `indus` | Indus | Indus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 56 | `lacerta` | Lacerta | Lacerta | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 57 | `leo-minor` | Leo Minor | Leo Minor | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 58 | `lepus` | Lepus | Lepus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 59 | `libra` | Libra | Libra | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 60 | `lupus` | Lupus | Lupus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 61 | `lynx` | Lynx | Lynx | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 62 | `mensa` | Mensa | Mensa | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 63 | `microscopium` | Microscopium | Microscopium | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 64 | `monoceros` | Monoceros | Monoceros | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 65 | `musca` | Musca | Musca | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 66 | `norma` | Norma | Norma | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 67 | `octans` | Octans | Octans | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 68 | `ophiuchus` | Ophiuchus | Ophiuchus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 69 | `pavo` | Pavo | Pavo | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 70 | `phoenix` | Phoenix | Phoenix | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 71 | `pictor` | Pictor | Pictor | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 72 | `piscis-austrinus` | Piscis Austrinus | Piscis Austrinus | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 73 | `puppis` | Puppis | Puppis | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 74 | `pyxis` | Pyxis | Pyxis | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 75 | `reticulum` | Reticulum | Reticulum | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 76 | `sagitta` | Sagitta | Sagitta | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 77 | `sculptor` | Sculptor | Sculptor | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 78 | `scutum` | Scutum | Scutum | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 79 | `serpens` | Serpens | Serpens | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 80 | `sextans` | Sextans | Sextans | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 81 | `telescopium` | Telescopium | Telescopium | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 82 | `triangulum` | Triangulum | Triangulum | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 83 | `triangulum-australe` | Triangulum Australe | Triangulum Australe | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 84 | `tucana` | Tucana | Tucana | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 85 | `vela` | Vela | Vela | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 86 | `virgo` | Virgo | Virgo | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 87 | `volans` | Volans | Volans | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |
| 88 | `vulpecula` | Vulpecula | Vulpecula | yes | yes | MATCH | Mapped by number + exact IAU name + existing ID; translated title was not used as identity. |

## Decision

All 88 mappings are exact and high-confidence. Phase 2 was permitted and completed.

## Post-integration integrity check

- English story SHA-256 after integration: `98fbbc4b86f801aee6df8cdb954d3a644e53a6c73808b145feff7078197e8356` — unchanged.
- Puzzle coordinates/connections SHA-256 after integration: `d804ea55df720c2c8ba613ecac54326d0ebe45c99629416630a2e2fe21c1d995` — unchanged.
- Telugu data is stored additively in `src/shared/teluguStories.json` and attached under `localized.te`.
- Generated Telugu data was compared byte-for-byte with the final approved Markdown parser output after integration.
- Story language switch is implemented in `src/client/ui/StoryCard.ts` and used by both completed gameplay and My Sky.
