"""Build or verify the Open Font License subset used by native Aden dialogue."""

import argparse
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "Unreal" / "Veilpoint"
TARGET = PROJECT / "Content" / "StoryFonts" / "VeilpointDialogueKR-Regular.otf"
RUNTIME = PROJECT / "Source" / "Veilpoint"
FAMILY = "Veilpoint Dialogue KR"
POSTSCRIPT = "VeilpointDialogueKR-Regular"


def characters():
    chars = set(range(32, 127))
    for source in ("VPAdenCampaign.cpp", "VPAdenStoryGameMode.cpp",
                   "VPAdenPrologue.cpp", "VPAdenPrologueLines.inl"):
        chars.update(ord(c) for c in (RUNTIME / source).read_text(encoding="utf-8")
                     if 0xAC00 <= ord(c) <= 0xD7A3)
    return chars


def check(font, required):
    missing = required - font.getBestCmap().keys()
    if missing:
        raise ValueError("Missing dialogue glyphs: " + "".join(chr(c) for c in sorted(missing)))


def build(source, index):
    with TTFont(source, fontNumber=index, recalcTimestamp=False) as font:
        if font["name"].getBestFamilyName() != "Noto Sans CJK KR":
            raise ValueError("Expected the regular Korean face from Noto Sans CJK")
        required = characters()
        check(font, required)
        options = subset.Options()
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        narrow = subset.Subsetter(options=options)
        narrow.populate(unicodes=required)
        narrow.subset(font)
        names = {1: FAMILY, 3: POSTSCRIPT, 4: FAMILY + " Regular", 6: POSTSCRIPT, 16: FAMILY}
        for record in font["name"].names:
            if record.nameID in names:
                record.string = names[record.nameID]
            elif record.nameID == 2 or record.nameID == 17:
                record.string = "Regular"
        if "CFF " in font:
            cff = font["CFF "].cff
            cff.fontNames = [POSTSCRIPT]
            top = cff.topDictIndex[0]
            top.FamilyName = FAMILY
            top.FullName = FAMILY + " Regular"
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        font.save(TARGET)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, nargs="?")
    parser.add_argument("--font-number", type=int, default=1)
    args = parser.parse_args()
    if args.source:
        build(args.source, args.font_number)
    with TTFont(TARGET) as font:
        required = characters()
        check(font, required)
        if font["name"].getBestFamilyName() != FAMILY:
            raise ValueError("Missing project font identity")
        print(f"Verified {len(required)} dialogue glyphs in {TARGET.name}")
