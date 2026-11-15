/**
 * How many of a person's films and series their page asks the library for:
 * more than any one person's filmography in a library.
 */
export const PERSON_TITLES_LIMIT = 300;

/**
 * How many of a person's episodes their page reads, for the series they are
 * in only through them (`getPersonTitles`). A series repeats across its
 * episodes, so this covers a guest in many series and a lead in a few long
 * ones without reading a soap regular's every episode. A series found only
 * past the bound is left to Seerr's card.
 */
export const PERSON_EPISODES_LIMIT = 300;
