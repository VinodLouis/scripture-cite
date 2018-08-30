
export interface BibileVerses {
    chapter_from: Number,
    chapter_name_from: String,
    verse_no_from:Number,
    chapter_to: Number,
    chapter_name_to: String,
    verse_no_to: Number,
    verses: Array<String>
}

export interface BibileVerse {
    chapter: Number,
    verse_no:Number,
    verse: String
}